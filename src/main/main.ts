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
import { IntegracoesService } from './services/IntegracoesService';
import { PolicyService } from './services/PolicyService';
import { SessaoService } from './services/SessaoService';
import { UsuarioRepository } from './repositories/UsuarioRepository';
import { UsuarioService } from './services/UsuarioService';
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
  private policyService = new PolicyService(this.sessaoService);
  private usuarioService = new UsuarioService(new UsuarioRepository(), this.policyService);
  private integracoesService = new IntegracoesService();
  private removerHandlers: (() => void) | null = null;

  constructor() {
    app.whenReady().then(async () => {
      try {
        await this.arquivoService.iniciar();
      } catch (erro) {
        console.error('[Anexos] Falha ao preparar o diretório de staging:', erro);
      }
      await this.integracoesService.iniciar();
      this.removerHandlers = registrarHandlersIpc({
        clientePetService: this.clientePetService,
        authService: this.authService,
        consultaService: this.consultaService,
        vacinaService: this.vacinaService,
        anexoService: this.anexoService,
        arquivoService: this.arquivoService,
        estoqueService: this.estoqueService,
        sessaoService: this.sessaoService,
        usuarioService: this.usuarioService,
        policyService: this.policyService,
        integracoesService: this.integracoesService,
      });
      this.criarJanela();
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });

    app.on('before-quit', () => {
      this.removerHandlers?.();
      this.removerHandlers = null;
      void this.integracoesService.parar().catch((erro: unknown) => {
        console.error('[Integrações] Falha ao encerrar a API local:', erro);
      });
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
        sandbox: true,
      },
    });

    this.mainWindow.loadFile(path.join(__dirname, '../renderer/renderer.html'));
  }
}

new MainApp();
