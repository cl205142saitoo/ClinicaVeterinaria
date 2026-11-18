import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { ClientePetService } from './services/ClientePetService';

class MainApp {
  private mainWindow: BrowserWindow | null = null;
  private clientePetService = new ClientePetService();

  constructor() {
    app.whenReady().then(() => {
      this.registrarRotasIPC();
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

    this.mainWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));
  }

  private registrarRotasIPC() {
    ipcMain.handle('api:buscarCep', (_, cep) => this.clientePetService.buscarEnderecoPorCep(cep));
    ipcMain.handle('clientes:listar', () => this.clientePetService.listarClientes());
    ipcMain.handle('clientes:criar', (_, dados) => this.clientePetService.criarCliente(dados));
    ipcMain.handle('clientes:deletar', (_, id) => this.clientePetService.deletarCliente(id));
    ipcMain.handle('pets:listar', () => this.clientePetService.listarPets());
    ipcMain.handle('pets:criar', (_, dados) => this.clientePetService.criarPet(dados));
    ipcMain.handle('pets:deletar', (_, id) => this.clientePetService.deletarPet(id));
  }
}

new MainApp();