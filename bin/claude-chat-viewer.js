#!/usr/bin/env node

const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const open = require('open');
const path = require('path');
const autocompletePrompt = require('inquirer-autocomplete-prompt');

// Register the autocomplete prompt type
inquirer.registerPrompt('autocomplete', autocompletePrompt);

const ConversationParser = require('../lib/conversation-parser');
const HtmlGenerator = require('../lib/html-generator');

class ClaudeChatCLI {
    constructor() {
        this.parser = new ConversationParser();
        this.htmlGenerator = new HtmlGenerator();
        this.conversations = [];
        this.todoTheme = 'grid'; // Default theme
        this.parseCliArgs();
    }

    parseCliArgs() {
        const args = process.argv.slice(2);
        
        for (let i = 0; i < args.length; i++) {
            if (args[i].startsWith('--todo-background=')) {
                this.todoTheme = args[i].split('=')[1];
            } else if (args[i] === '--todo-background' && args[i + 1]) {
                this.todoTheme = args[i + 1];
                i++; // Skip next argument
            } else if (args[i] === '--help' || args[i] === '-h') {
                this.showHelp();
                process.exit(0);
            }
        }

        // Validate theme
        const validThemes = ['grid', 'lines', 'graph', 'dots', 'clean'];
        if (!validThemes.includes(this.todoTheme)) {
            console.error(chalk.red(`❌ Invalid TODO theme: ${this.todoTheme}`));
            console.error(chalk.yellow(`Valid themes: ${validThemes.join(', ')}`));
            process.exit(1);
        }
    }

    showHelp() {
        console.log(chalk.cyan.bold('🤖 Claude Conversation Viewer'));
        console.log('Encuentra y visualiza tus conversaciones de Claude Code\n');
        console.log(chalk.white('Uso:'));
        console.log('  claude-chat [opciones]\n');
        console.log(chalk.white('Opciones:'));
        console.log('  --todo-background=TEMA  Tema de fondo para TODOs');
        console.log('  --help, -h              Mostrar esta ayuda\n');
        console.log(chalk.white('Temas disponibles para --todo-background:'));
        console.log('  grid    Cuadrícula sutil (por defecto)');
        console.log('  lines   Papel pautado con líneas horizontales');
        console.log('  graph   Papel milimetrado denso');
        console.log('  dots    Bullet journal con puntos');
        console.log('  clean   Sin fondo especial\n');
        console.log(chalk.white('Ejemplos:'));
        console.log('  claude-chat');
        console.log('  claude-chat --todo-background=dots');
        console.log('  claude-chat --todo-background lines');
    }

    async run() {
        console.log(chalk.cyan.bold('🤖 Claude Conversation Viewer'));
        console.log(chalk.gray('Encuentra y visualiza tus conversaciones de Claude Code\n'));

        try {
            await this.loadConversations();
            await this.showMainMenu();
        } catch (error) {
            console.error(chalk.red(`❌ Error: ${error.message}`));
            process.exit(1);
        }
    }

    async loadConversations() {
        const spinner = ora('Escaneando conversaciones...').start();
        
        try {
            this.conversations = await this.parser.getAllConversations();
            spinner.succeed(`✅ Encontradas ${this.conversations.length} conversaciones`);
        } catch (error) {
            spinner.fail('Error al cargar conversaciones');
            throw error;
        }
    }

    async showMainMenu() {
        while (true) {
            console.log('\n' + '='.repeat(80));
            console.log(chalk.green(`📋 Total de conversaciones: ${this.conversations.length}\n`));
            console.log(chalk.gray('💡 Escribe para filtrar por fecha, proyecto o contenido'));
            console.log(chalk.gray('   Usa las flechas para navegar, Enter para seleccionar\n'));

            const { action } = await inquirer.prompt([
                {
                    type: 'autocomplete',
                    name: 'action',
                    message: '🔍 Buscar conversación:',
                    pageSize: 12,
                    source: async (answersSoFar, input) => {
                        return this.searchConversations(input);
                    }
                }
            ]);

            if (action === 'exit') {
                console.log(chalk.cyan('👋 ¡Hasta luego!'));
                process.exit(0);
            } else if (action === 'reload') {
                await this.loadConversations();
            } else if (typeof action === 'object' && action.conversation) {
                await this.showConversationDetail(action.conversation);
            }
        }
    }

    searchConversations(input = '') {
        const searchTerm = input.toLowerCase().trim();
        
        // Filter conversations based on search term
        let filtered = this.conversations;
        if (searchTerm) {
            filtered = this.conversations.filter(conv => {
                // Search in date/time
                const dateStr = `${this.parser.formatDateCompact(conv.startTime)} ${this.parser.formatDateCompact(conv.endTime)}`.toLowerCase();
                if (dateStr.includes(searchTerm)) return true;
                
                // Search in project name
                if (conv.projectName.toLowerCase().includes(searchTerm)) return true;
                
                // Search in first prompt
                if (conv.firstPrompt.toLowerCase().includes(searchTerm)) return true;
                
                // Search in session ID (for direct access)
                if (conv.sessionId.toLowerCase().includes(searchTerm)) return true;
                
                return false;
            });
        }

        // Format choices
        const choices = filtered.map(conv => ({
            name: this.formatConversationListItem(conv),
            value: { conversation: conv },
            short: conv.projectName
        }));

        // Add control options at the end
        choices.push(
            new inquirer.Separator(),
            { name: chalk.cyan('🔄 Recargar conversaciones'), value: 'reload' },
            { name: chalk.red('❌ Salir'), value: 'exit' }
        );

        return choices;
    }

    formatConversationListItem(conv) {
        const startDate = chalk.cyan(this.parser.formatDateCompact(conv.startTime));
        const endDate = chalk.gray(`- ${this.parser.formatDateCompact(conv.endTime)}`);
        const messageCount = chalk.yellow(String(conv.messageCount).padStart(4, ' '));
        const project = chalk.blue(conv.projectName);
        const prompt = chalk.white(conv.firstPrompt);
        
        return `${startDate} ${endDate} [${messageCount}] ${project}\n  💬 ${prompt}`;
    }


    async showConversationDetail(conversation) {
        console.log('\n' + '='.repeat(80));
        console.log(chalk.cyan.bold('📄 Resumen de la conversación\n'));
        
        const summary = this.parser.getConversationSummary(conversation);
        console.log(summary);

        const { generateHtml } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'generateHtml',
                message: '¿Quieres generar la visualización HTML de esta conversación?',
                default: true
            }
        ]);

        if (generateHtml) {
            await this.generateVisualization(conversation);
        }
    }

    async generateVisualization(conversation) {
        const spinner = ora('Generando visualización HTML...').start();
        
        try {
            const result = await this.htmlGenerator.generateConversationHtml(
                conversation.filePath,
                process.cwd(),
                this.todoTheme
            );
            
            spinner.succeed(`✅ HTML generado: ${result.outputPath}`);
            console.log(chalk.gray(`📊 ${result.messageCount} mensajes procesados`));

            const { openFile } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'openFile',
                    message: '¿Abrir el archivo HTML en el navegador?',
                    default: true
                }
            ]);

            if (openFile) {
                await open(result.outputPath);
                console.log(chalk.green('🌐 Archivo abierto en el navegador'));
            }

            console.log(chalk.cyan('\n✨ ¡Visualización completada!'));
            
        } catch (error) {
            spinner.fail('Error al generar la visualización');
            console.error(chalk.red(error.message));
        }
    }
}

// Run the CLI
if (require.main === module) {
    const cli = new ClaudeChatCLI();
    cli.run().catch(error => {
        console.error(chalk.red(`Fatal error: ${error.message}`));
        process.exit(1);
    });
}

module.exports = ClaudeChatCLI;