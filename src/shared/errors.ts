/** Erro de domínio com mensagem segura para exibição ao usuário. */
export class ErroAplicacao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroAplicacao';
    // Detalhes de implementação do processo principal não devem cruzar a ponte IPC.
    this.stack = undefined;
  }
}
