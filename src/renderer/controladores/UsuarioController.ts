/** Administração de usuários: listagem, edição de perfil e inativação auditada. */

import type { DadosAtualizacaoUsuario, Role, Usuario } from '../types';
import {
  criarBadge,
  criarBotaoAcao,
  criarCelula,
  exigir,
  focarPrimeiroInvalido,
  linhaMensagem,
  limparValidacao,
  marcarInvalido,
  mensagemErro,
  mostrarToast,
  obrigatorio,
  pedirMotivo,
  setCarregando,
} from '../ui';
import type { ContextoApp } from './contexto';

const COLUNAS = 6;

const ROTULOS_ROLE: Readonly<Record<Role, string>> = {
  ADMIN: 'Administrador',
  VETERINARIO: 'Veterinário',
  ATENDENTE: 'Atendente',
};

const CLASSES_ROLE: Readonly<Record<Role, string>> = {
  ADMIN: 'text-bg-primary',
  VETERINARIO: 'text-bg-info',
  ATENDENTE: 'text-bg-secondary',
};

export class UsuarioController {
  private usuariosVisiveis = new Map<number, Usuario>();
  private idEdicao: number | null = null;
  private eventosLigados = false;

  constructor(private readonly contexto: ContextoApp) {}

  iniciar(): void {
    if (!this.eventosLigados) {
      this.eventosLigados = true;
      this.configurarEventos();
    }
    this.limparFormulario();
  }

  /** Carrega a seção somente para ADMIN (o backend também valida). */
  async carregar(): Promise<void> {
    const secao = obrigatorio<HTMLElement>('#secUsuarios');
    secao.hidden = !this.contexto.auth.isAdmin();
    if (!this.contexto.auth.isAdmin()) {
      this.usuariosVisiveis.clear();
      this.renderizar([]);
      return;
    }

    const corpo = obrigatorio<HTMLTableSectionElement>('#tbUsuarios');
    corpo.setAttribute('aria-busy', 'true');
    corpo.replaceChildren(linhaMensagem('Carregando usuários…', COLUNAS));

    try {
      this.renderizar(await window.api.listarUsuarios());
    } catch (erro) {
      corpo.replaceChildren(
        linhaMensagem('Não foi possível carregar os usuários.', COLUNAS, 'text-center text-danger py-4')
      );
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      corpo.setAttribute('aria-busy', 'false');
    }
  }

  limpar(): void {
    this.idEdicao = null;
    this.usuariosVisiveis.clear();
    this.renderizar([]);
    this.limparFormulario();
    obrigatorio<HTMLElement>('#secUsuarios').hidden = true;
    obrigatorio<HTMLTableSectionElement>('#tbUsuarios').setAttribute('aria-busy', 'false');
  }

  private renderizar(usuarios: Usuario[]): void {
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbUsuarios');
    corpo.replaceChildren();
    this.usuariosVisiveis = new Map(usuarios.map((usuario) => [usuario.id, usuario]));

    if (usuarios.length === 0) {
      corpo.append(linhaMensagem('Nenhum usuário encontrado.', COLUNAS));
      return;
    }

    for (const usuario of usuarios) {
      const linha = document.createElement('tr');
      const criadoEm = new Date(usuario.criadoEm);
      linha.append(
        criarCelula(usuario.nome, 'text-break small'),
        criarCelula(usuario.email, 'text-break small'),
        this.celulaRole(usuario.role),
        this.celulaSituacao(usuario.ativo),
        criarCelula(Number.isNaN(criadoEm.getTime()) ? '—' : criadoEm.toLocaleDateString('pt-BR'), 'text-nowrap small')
      );

      const acoes = document.createElement('td');
      const grupo = document.createElement('div');
      grupo.className = 'd-flex flex-wrap gap-1';
      grupo.setAttribute('role', 'group');
      grupo.setAttribute('aria-label', `Ações do usuário ${usuario.nome}`);
      grupo.append(
        criarBotaoAcao('editar-usuario', usuario.id, 'Editar', `Editar o usuário ${usuario.nome}`),
        criarBotaoAcao(
          'inativar-usuario',
          usuario.id,
          'Inativar',
          `Inativar o usuário ${usuario.nome}`,
          'btn-outline-warning'
        )
      );
      acoes.append(grupo);
      linha.append(acoes);
      corpo.append(linha);
    }
  }

  private celulaRole(role: Role): HTMLTableCellElement {
    const celula = document.createElement('td');
    celula.append(criarBadge(ROTULOS_ROLE[role] ?? role, CLASSES_ROLE[role] ?? 'text-bg-secondary'));
    return celula;
  }

  private celulaSituacao(ativo: boolean): HTMLTableCellElement {
    const celula = document.createElement('td');
    celula.append(criarBadge(ativo ? 'Ativo' : 'Inativo', ativo ? 'text-bg-success' : 'text-bg-secondary'));
    return celula;
  }

  private limparFormulario(): void {
    this.idEdicao = null;
    const formulario = obrigatorio<HTMLFormElement>('#formUsuario');
    formulario.reset();
    limparValidacao(formulario);
    obrigatorio<HTMLInputElement>('#uId').value = '';
    obrigatorio<HTMLSelectElement>('#uRole').value = 'ATENDENTE';
    obrigatorio<HTMLInputElement>('#uAtivo').checked = true;
    obrigatorio<HTMLButtonElement>('#btnSalvarUsuario').textContent = 'Salvar alterações';
    obrigatorio<HTMLElement>('#uFormTitulo').textContent = 'Editar usuário';
  }

  private preencherFormulario(usuario: Usuario): void {
    this.idEdicao = usuario.id;
    const formulario = obrigatorio<HTMLFormElement>('#formUsuario');
    obrigatorio<HTMLInputElement>('#uId').value = String(usuario.id);
    obrigatorio<HTMLInputElement>('#uNome').value = usuario.nome;
    obrigatorio<HTMLInputElement>('#uEmail').value = usuario.email;
    obrigatorio<HTMLInputElement>('#uCrmv').value = usuario.crmv ?? '';
    obrigatorio<HTMLInputElement>('#uRg').value = usuario.rg ?? '';
    obrigatorio<HTMLSelectElement>('#uRole').value = usuario.role;
    obrigatorio<HTMLInputElement>('#uAtivo').checked = usuario.ativo;

    limparValidacao(formulario);
    obrigatorio<HTMLElement>('#uFormTitulo').textContent = `Editar usuário — ${usuario.nome}`;
    obrigatorio<HTMLButtonElement>('#btnSalvarUsuario').textContent = 'Salvar alterações';
    obrigatorio<HTMLInputElement>('#uNome').focus();
  }

  private async criar(evento: Event, botao: HTMLButtonElement): Promise<void> {
    evento.preventDefault();
    if (!this.contexto.auth.isAdmin()) {
      mostrarToast('Somente um administrador pode criar usuários.', 'erro');
      return;
    }

    const formulario = obrigatorio<HTMLFormElement>('#formCriarUsuario');
    const nome = obrigatorio<HTMLInputElement>('#nuNome');
    const email = obrigatorio<HTMLInputElement>('#nuEmail');
    const senha = obrigatorio<HTMLInputElement>('#nuSenha');
    const crmv = obrigatorio<HTMLInputElement>('#nuCrmv');
    const rg = obrigatorio<HTMLInputElement>('#nuRg');
    const roleSelect = obrigatorio<HTMLSelectElement>('#nuRole');
    limparValidacao(formulario);

    const role = roleSelect.value;
    const resultados = [
      exigir(nome, nome.value.trim().length >= 2, 'Informe o nome completo do usuário.'),
      exigir(email, email.value.trim() !== '' && email.checkValidity(), 'Informe um e-mail válido.'),
      exigir(senha, senha.value.length >= 6, 'A senha deve ter pelo menos 6 caracteres.'),
      exigir(roleSelect, role === 'VETERINARIO' || role === 'ATENDENTE', 'Selecione um perfil válido.'),
      exigir(crmv, crmv.value.trim().length <= 30, 'O CRMV deve ter no máximo 30 caracteres.'),
      exigir(rg, rg.value.trim().length <= 30, 'O RG deve ter no máximo 30 caracteres.'),
    ];
    if (!resultados.every(Boolean)) {
      focarPrimeiroInvalido(formulario);
      return;
    }

    setCarregando(botao, true, 'Criando…');
    try {
      const criado = await window.api.criarUsuario({
        nome: nome.value.trim(),
        email: email.value.trim(),
        senha: senha.value,
        crmv: role === 'VETERINARIO' ? crmv.value.trim() || null : null,
        rg: rg.value.trim() || null,
        role: role as 'VETERINARIO' | 'ATENDENTE',
      });
      formulario.reset();
      limparValidacao(formulario);
      mostrarToast(`${criado.nome} criado como ${criado.role === 'VETERINARIO' ? 'veterinário' : 'atendente'}.`, 'sucesso');
      await this.carregar();
    } catch (erro) {
      const mensagem = mensagemErro(erro);
      marcarInvalido(email, mensagem);
      mostrarToast(mensagem, 'erro');
      email.focus();
    } finally {
      setCarregando(botao, false);
    }
  }

  private async salvar(evento: Event, botao: HTMLButtonElement): Promise<void> {
    evento.preventDefault();
    if (!this.contexto.auth.isAdmin()) {
      mostrarToast('Somente um administrador pode alterar usuários.', 'erro');
      return;
    }

    const formulario = obrigatorio<HTMLFormElement>('#formUsuario');
    const nome = obrigatorio<HTMLInputElement>('#uNome');
    const email = obrigatorio<HTMLInputElement>('#uEmail');
    const crmv = obrigatorio<HTMLInputElement>('#uCrmv');
    const rg = obrigatorio<HTMLInputElement>('#uRg');
    const roleSelect = obrigatorio<HTMLSelectElement>('#uRole');
    const ativo = obrigatorio<HTMLInputElement>('#uAtivo');
    limparValidacao(formulario);

    const role = roleSelect.value as Role;
    const roleValida = role === 'ADMIN' || role === 'VETERINARIO' || role === 'ATENDENTE';
    const resultados = [
      exigir(nome, nome.value.trim().length >= 2, 'Informe o nome completo do usuário.'),
      exigir(email, email.value.trim() !== '' && email.checkValidity(), 'Informe um e-mail válido.'),
      exigir(roleSelect, roleValida, 'Selecione um perfil válido.'),
      exigir(crmv, crmv.value.trim().length <= 30, 'O CRMV deve ter no máximo 30 caracteres.'),
      exigir(rg, rg.value.trim().length <= 30, 'O RG deve ter no máximo 30 caracteres.'),
    ];
    if (!resultados.every(Boolean)) {
      focarPrimeiroInvalido(formulario);
      return;
    }

    const id = Number(obrigatorio<HTMLInputElement>('#uId').value);
    if (!Number.isInteger(id) || id <= 0) {
      marcarInvalido(nome, 'Selecione um usuário na lista antes de salvar.');
      nome.focus();
      return;
    }

    const dados: DadosAtualizacaoUsuario = {
      id,
      nome: nome.value.trim(),
      email: email.value.trim(),
      crmv: crmv.value.trim() || null,
      rg: rg.value.trim() || null,
      role,
      ativo: ativo.checked,
    };

    setCarregando(botao, true, 'Salvando…');
    try {
      await window.api.atualizarUsuario(dados);
      mostrarToast('Usuário atualizado com sucesso.', 'sucesso');
      this.limparFormulario();
      await this.carregar();
    } catch (erro) {
      const mensagem = mensagemErro(erro);
      marcarInvalido(email, mensagem);
      mostrarToast(mensagem, 'erro');
      email.focus();
    } finally {
      setCarregando(botao, false);
    }
  }

  private async inativar(usuario: Usuario, botao: HTMLButtonElement): Promise<void> {
    if (!this.contexto.auth.isAdmin()) return;
    const motivo = await pedirMotivo({
      titulo: 'Inativar usuário',
      descricao:
        `O usuário "${usuario.nome}" perderá o acesso ao sistema. ` +
        'O histórico é preservado e o motivo fica registrado na auditoria.',
      rotuloConfirmar: 'Inativar usuário',
    });
    if (motivo === null) return;

    setCarregando(botao, true, 'Inativando…');
    try {
      await window.api.inativarUsuario({ id: usuario.id, motivo });
      if (this.idEdicao === usuario.id) this.limparFormulario();
      mostrarToast('Usuário inativado. O motivo foi registrado na auditoria.', 'sucesso');
      await this.carregar();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private configurarEventos(): void {
    obrigatorio<HTMLFormElement>('#formCriarUsuario').addEventListener('submit', (evento) => {
      void this.criar(evento, obrigatorio<HTMLButtonElement>('#btnCriarUsuario'));
    });
    obrigatorio<HTMLFormElement>('#formUsuario').addEventListener('submit', (evento) => {
      void this.salvar(evento, obrigatorio<HTMLButtonElement>('#btnSalvarUsuario'));
    });
    obrigatorio<HTMLButtonElement>('#btnNovoUsuario').addEventListener('click', () => {
      this.limparFormulario();
      obrigatorio<HTMLInputElement>('#uNome').focus();
    });

    obrigatorio<HTMLTableSectionElement>('#tbUsuarios').addEventListener('click', (evento) => {
      const alvo = evento.target;
      if (!(alvo instanceof Element)) return;
      const botao = alvo.closest<HTMLButtonElement>('button[data-acao][data-id]');
      if (!botao || botao.disabled) return;
      const id = Number(botao.dataset.id);
      if (!Number.isInteger(id) || id <= 0) return;
      const usuario = this.usuariosVisiveis.get(id);
      if (usuario === undefined) return;

      if (botao.dataset.acao === 'editar-usuario') this.preencherFormulario(usuario);
      else if (botao.dataset.acao === 'inativar-usuario') void this.inativar(usuario, botao);
    });
  }
}
