/**
 * Prepara os arquivos estáticos do renderer em dist/renderer/ e empacota o
 * preload do main. Executa depois do `tsc`: o tsc emite CommonJS, que não
 * funciona em `file://` no renderer, e o preload roda com `sandbox: true`, onde
 * `require()` de módulos locais é bloqueado (erro "module not found").
 * Por isso ambos são transformados em um único arquivo pelo esbuild.
 */
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const raiz = path.resolve(__dirname, '..');
const origem = path.join(raiz, 'src', 'renderer');
const destino = path.join(raiz, 'dist', 'renderer');
const vendor = path.join(destino, 'vendor');

function copiar(arquivoOrigem, arquivoDestino) {
  fs.mkdirSync(path.dirname(arquivoDestino), { recursive: true });
  fs.copyFileSync(arquivoOrigem, arquivoDestino);
}

fs.mkdirSync(vendor, { recursive: true });

// Remove os arquivos CommonJS gerados pelo tsc para os módulos do renderer.
for (const nome of fs.readdirSync(origem)) {
  if (nome.endsWith('.ts') && !nome.endsWith('.d.ts')) {
    const compilado = path.join(destino, nome.replace(/\.ts$/, '.js'));
    if (fs.existsSync(compilado)) fs.rmSync(compilado);
  }
}

// O preload roda com sandbox: true. Nesse modo o Electron só permite
// `require('electron')`; qualquer require de arquivo local falha. Empacotar
// resolve as importações de ../shared/ipc-channels e ./ipc/invocar em tempo de
// build, deixando apenas o require do módulo do Electron no arquivo final.
esbuild.buildSync({
  entryPoints: [path.join(raiz, 'src', 'main', 'preload.ts')],
  outfile: path.join(raiz, 'dist', 'main', 'preload.js'),
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  external: ['electron'],
  logLevel: 'info',
});

esbuild.buildSync({
  entryPoints: [path.join(origem, 'main.ts')],
  outfile: path.join(destino, 'app.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  logLevel: 'info',
});

copiar(path.join(origem, 'renderer.html'), path.join(destino, 'renderer.html'));
copiar(path.join(origem, 'styles.css'), path.join(destino, 'styles.css'));
copiar(
  path.join(raiz, 'node_modules', 'bootstrap', 'dist', 'css', 'bootstrap.min.css'),
  path.join(vendor, 'bootstrap.min.css')
);
copiar(
  path.join(raiz, 'node_modules', 'bootstrap', 'dist', 'js', 'bootstrap.bundle.min.js'),
  path.join(vendor, 'bootstrap.bundle.min.js')
);

console.log('Assets do renderer copiados para dist/renderer.');
