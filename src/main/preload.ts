import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  buscarCep: (cep: string) => ipcRenderer.invoke('api:buscarCep', cep),
  listarClientes: () => ipcRenderer.invoke('clientes:listar'),
  criarCliente: (dados: any) => ipcRenderer.invoke('clientes:criar', dados),
  deletarCliente: (id: number) => ipcRenderer.invoke('clientes:deletar', id),
  listarPets: () => ipcRenderer.invoke('pets:listar'),
  criarPet: (dados: any) => ipcRenderer.invoke('pets:criar', dados),
  deletarPet: (id: number) => ipcRenderer.invoke('pets:deletar', id),
});