/** Administração de usuários: criação em abas, listagem e inativação auditada. */

import type { BootstrapModal, DadosAtualizacaoUsuario, Role, Usuario } from '../types';
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
  validarRg,
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
  private modalEdicao: BootstrapModal | null = null;
  private eventosLigados = false;

  constructor(private readonly contexto: ContextoApp) {}

  iniciar(): void {
    if (!this.eventosLigados) {
      this.eventosLigados = true;
      this.configurarEventos();
    }
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
    this.modalEdicao?.hide();
    this.usuariosVisiveis.clear();
    this.renderizar([]);
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
      const botoes = [
        criarBotaoAcao('editar-usuario', usuario.id, 'Editar', `Editar o usuário ${usuario.nome}`),
      ];
      if (usuario.ativo) {
        botoes.push(
          criarBotaoAcao(
            'inativar-usuario',
            usuario.id,
            'Inativar',
            `Inativar o usuário ${usuario.nome}`,
            'btn-outline-warning'
          )
        );
      } else {
        botoes.push(
          criarBotaoAcao(
            'reativar-usuario',
            usuario.id,
            'Reativar',
            `Reativar o usuário ${usuario.nome}`,
            'btn-outline-success'
          )
        );
      }
      grupo.append(...botoes);
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

  /** O perfil é fixo na aba: nunca é lido de um controle editável pelo renderer. */
  private async criar(
    evento: Event,
    botao: HTMLButtonElement,
    opcoes: {
      formulario: HTMLFormElement;
      nome: HTMLInputElement;
      email: HTMLInputElement;
      senha: HTMLInputElement;
      crmv: HTMLInputElement | null;
      rg: HTMLInputElement;
      ativo: HTMLInputElement;
      role: 'VETERINARIO' | 'ATENDENTE';
    }
  ): Promise<void> {
    evento.preventDefault();
    if (!this.contexto.auth.isAdmin()) {
      mostrarToast('Somente um administrador pode criar usuários.', 'erro');
      return;
    }

    const { formulario, nome, email, senha, rg, ativo, role } = opcoes;
    limparValidacao(formulario);

    const resultados = [
      exigir(nome, nome.value.trim().length >= 2, 'Informe o nome completo do usuário.'),
      exigir(email, email.value.trim() !== '' && email.checkValidity(), 'Informe um e-mail válido.'),
      exigir(senha, senha.value.length >= 6, 'A senha deve ter pelo menos 6 caracteres.'),
      validarRg(rg),
    ];
    if (opcoes.crmv !== null) {
      resultados.push(
        exigir(opcoes.crmv, opcoes.crmv.value.trim().length <= 30, 'O CRMV deve ter no máximo 30 caracteres.')
      );
    }
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
        crmv: role === 'VETERINARIO' ? opcoes.crmv?.value.trim() || null : null,
        rg: rg.value.trim() || null,
        role,
        ativo: ativo.checked,
      });
      formulario.reset();
      limparValidacao(formulario);
      mostrarToast(
        `${criado.nome} criado como ${criado.role === 'VETERINARIO' ? 'veterinário' : 'atendente'}.`,
        'sucesso'
      );
      await this.carregar();
      await this.contexto.recarregarVeterinarios();
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
      mostrarToast('Usuário inativado. O motivo foi registrado na auditoria.', 'sucesso');
      await this.carregar();
      await this.contexto.recarregarVeterinarios();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private async reativar(usuario: Usuario, botao: HTMLButtonElement): Promise<void> {
    if (!this.contexto.auth.isAdmin()) return;

    setCarregando(botao, true, 'Reativando…');
    try {
      await window.api.reativarUsuario(usuario.id);
      mostrarToast('Usuário reativado com sucesso.', 'sucesso');
      await this.carregar();
      await this.contexto.recarregarVeterinarios();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private abrirModalEdicao(usuario: Usuario): void {
    if (!this.contexto.auth.isAdmin()) return;
    obrigatorio<HTMLInputElement>('#euId').value = String(usuario.id);
    obrigatorio<HTMLInputElement>('#euNome').value = usuario.nome;
    obrigatorio<HTMLInputElement>('#euEmail').value = usuario.email;
    obrigatorio<HTMLInputElement>('#euCrmv').value = usuario.crmv ?? '';
    obrigatorio<HTMLInputElement>('#euRg').value = usuario.rg ?? '';
    obrigatorio<HTMLSelectElement>('#euRole').value = usuario.role;
    obrigatorio<HTMLInputElement>('#euAtivo').checked = usuario.ativo;
    this.atualizarVisibilidadeCrmv();
    obrigatorio<HTMLElement>('#modalEditarUsuarioTitulo').textContent = `Editar usuário — ${usuario.nome}`;

    const formulario = obrigatorio<HTMLFormElement>('#formEditarUsuario');
    limparValidacao(formulario);
    const modalElemento = obrigatorio<HTMLDivElement>('#modalEditarUsuario');
    modalElemento.addEventListener(
      'shown.bs.modal',
      () => obrigatorio<HTMLInputElement>('#euNome').focus(),
      { once: true }
    );
    // Uma única instância por elemento: criar outra no hide deixaria o backdrop preso.
    this.modalEdicao ??= window.bootstrap.Modal.getOrCreateInstance(modalElemento, {
      backdrop: 'static',
      keyboard: false,
    });
    this.modalEdicao.show();
  }

  /** CRMV é campo exclusivo de veterinário; ao trocar o perfil, limpa o valor. */
  private atualizarVisibilidadeCrmv(): void {
    const formulario = obrigatorio<HTMLFormElement>('#formEditarUsuario');
    const visivel = obrigatorio<HTMLSelectElement>('#euRole').value === 'VETERINARIO';
    obrigatorio<HTMLElement>('#euGrupoCrmv').hidden = !visivel;
    if (!visivel) {
      obrigatorio<HTMLInputElement>('#euCrmv').value = '';
      limparValidacao(formulario);
    }
  }

  private async salvarEdicao(botao: HTMLButtonElement): Promise<void> {
    if (!this.contexto.auth.isAdmin()) return;
    const formulario = obrigatorio<HTMLFormElement>('#formEditarUsuario');
    const nome = obrigatorio<HTMLInputElement>('#euNome');
    const email = obrigatorio<HTMLInputElement>('#euEmail');
    const crmv = obrigatorio<HTMLInputElement>('#euCrmv');
    const rg = obrigatorio<HTMLInputElement>('#euRg');
    const roleSelect = obrigatorio<HTMLSelectElement>('#euRole');
    const ativo = obrigatorio<HTMLInputElement>('#euAtivo');
    limparValidacao(formulario);

    const role = roleSelect.value as Role;
    const roleValida = role === 'ADMIN' || role === 'VETERINARIO' || role === 'ATENDENTE';
    const crmvVisivel = role === 'VETERINARIO';
    const id = Number(obrigatorio<HTMLInputElement>('#euId').value);
    const resultados = [
      exigir(
        nome,
        nome.value.trim().length >= 2 && nome.value.trim().length <= 120,
        'Informe o nome (de 2 a 120 caracteres).'
      ),
      exigir(email, email.value.trim() !== '' && email.checkValidity(), 'Informe um e-mail válido.'),
      exigir(roleSelect, roleValida, 'Selecione um perfil válido.'),
      validarRg(rg),
    ];
    if (crmvVisivel) {
      resultados.push(exigir(crmv, crmv.value.trim().length <= 30, 'O CRMV deve ter no máximo 30 caracteres.'));
    } else {
      crmv.value = '';
    }
    if (!resultados.every(Boolean)) {
      focarPrimeiroInvalido(formulario);
      return;
    }
    if (!Number.isInteger(id) || id <= 0) {
      mostrarToast('Selecione um usuário na lista antes de salvar.', 'erro');
      return;
    }

    const dados: DadosAtualizacaoUsuario = {
      id,
      nome: nome.value.trim(),
      email: email.value.trim(),
      crmv: crmvVisivel ? crmv.value.trim() || null : null,
      rg: rg.value.trim() || null,
      role,
      ativo: ativo.checked,
    };

    setCarregando(botao, true, 'Salvando…');
    try {
      await window.api.atualizarUsuario(dados);
      this.modalEdicao?.hide();
      mostrarToast('Usuário atualizado com sucesso.', 'sucesso');
      await this.carregar();
      await this.contexto.recarregarVeterinarios();
    } catch (erro) {
      const mensagem = mensagemErro(erro);
      marcarInvalido(email, mensagem);
      mostrarToast(mensagem, 'erro');
      email.focus();
    } finally {
      setCarregando(botao, false);
    }
  }

  private configurarEventos(): void {
    obrigatorio<HTMLFormElement>('#formCriarUsuario').addEventListener('submit', (evento) => {
      void this.criar(evento, obrigatorio<HTMLButtonElement>('#btnCriarUsuario'), {
        formulario: obrigatorio<HTMLFormElement>('#formCriarUsuario'),
        nome: obrigatorio<HTMLInputElement>('#nuNome'),
        email: obrigatorio<HTMLInputElement>('#nuEmail'),
        senha: obrigatorio<HTMLInputElement>('#nuSenha'),
        crmv: obrigatorio<HTMLInputElement>('#nuCrmv'),
        rg: obrigatorio<HTMLInputElement>('#nuRg'),
        ativo: obrigatorio<HTMLInputElement>('#nuAtivo'),
        role: 'VETERINARIO',
      });
    });
    obrigatorio<HTMLFormElement>('#formCriarAtendente').addEventListener('submit', (evento) => {
      void this.criar(evento, obrigatorio<HTMLButtonElement>('#btnCriarAtendente'), {
        formulario: obrigatorio<HTMLFormElement>('#formCriarAtendente'),
        nome: obrigatorio<HTMLInputElement>('#naNome'),
        email: obrigatorio<HTMLInputElement>('#naEmail'),
        senha: obrigatorio<HTMLInputElement>('#naSenha'),
        crmv: null,
        rg: obrigatorio<HTMLInputElement>('#naRg'),
        ativo: obrigatorio<HTMLInputElement>('#naAtivo'),
        role: 'ATENDENTE',
      });
    });
    obrigatorio<HTMLFormElement>('#formEditarUsuario').addEventListener('submit', (evento) => {
      evento.preventDefault();
      void this.salvarEdicao(obrigatorio<HTMLButtonElement>('#btnSalvarEdicaoUsuario'));
    });
    obrigatorio<HTMLSelectElement>('#euRole').addEventListener('change', () => {
      this.atualizarVisibilidadeCrmv();
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

      if (botao.dataset.acao === 'editar-usuario') this.abrirModalEdicao(usuario);
      else if (botao.dataset.acao === 'inativar-usuario') void this.inativar(usuario, botao);
      else if (botao.dataset.acao === 'reativar-usuario') void this.reativar(usuario, botao);
    });
  }
}
