/** Deve ser o primeiro import: carrega DATABASE_URL antes de qualquer PrismaClient. */
import './config/carregarEnv';
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { registrarHandlersIpc } from './ipc/handlers';
import { AnexoArquivoService } from './services/AnexoArquivoService';
import { AnexoRepository } from './repositories/AnexoRepository';
import { AnexoService } from './services/AnexoService';
import { AuthService } from './services/AuthService';
import { ClientePetService } from './services/ClientePetService';
import { ConsultaRepository } from './repositories/ConsultaRepository';
import { ConsultaService } from './services/ConsultaService';
import { EstoqueRepository } from './repositories/EstoqueRepository';
import { EstoqueService } from './services/EstoqueService';
import { SessaoService } from './services/SessaoService';
import { VacinaRepository } from './repositories/VacinaRepository';
import { VacinaService } from './services/VacinaService';

class MainApp {
  private mainWindow: BrowserWindow | null = null;
  private clientePetService = new ClientePetService();
  private authService = new AuthService();
  private consultaService = new ConsultaService(new ConsultaRepository());
  private vacinaService = new VacinaService(new VacinaRepository());
  private anexoService = new AnexoService(new AnexoRepository());
  private arquivoService = new AnexoArquivoService();
  private estoqueService = new EstoqueService(new EstoqueRepository());
  private sessaoService = new SessaoService();

  constructor() {
    app.whenReady().then(async () => {
      try {
        await this.arquivoService.iniciar();
      } catch (erro) {
        console.error('[Anexos] Falha ao preparar o diretório de staging:', erro);
      }
      registrarHandlersIpc({
        clientePetService: this.clientePetService,
        authService: this.authService,
        consultaService: this.consultaService,
        vacinaService: this.vacinaService,
        anexoService: this.anexoService,
        arquivoService: this.arquivoService,
        estoqueService: this.estoqueService,
        sessaoService: this.sessaoService,
      });
      this.criarJanela();
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });
  }

  private criarJanela() {
    this.mainWindow = new BrowserWindow({
      width: 1100,
      height: 750,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.mainWindow.loadFile(path.join(__dirname, '../renderer/renderer.html'));
  }
}

new MainApp();
