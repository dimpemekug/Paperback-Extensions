// Customises the homepage paperback-cli generates in bundles/index.html: an "add" button
// for Legendum beside Paperback's, and the repository address with a copy button.
// Run after `paperback-cli bundle`.

import { readFileSync, writeFileSync } from "node:fs";

const path = process.argv[2] ?? "bundles/index.html";
let html = readFileSync(path, "utf8");

const button = /(<a\s+class="addToPaperbackButton[^"]*"[\s\S]*?>)\s*Add Repository to Paperback\s*(<\/a>)/;
if (!button.test(html)) {
  throw new Error(`${path}: the "Add Repository to Paperback" button was not found, the template changed`);
}

const addressBox = `
        <div
          class="mt-4 w-full max-w-md flex items-center gap-2 bg-white/5 border border-white/10 rounded-full pl-4 pr-1 py-1"
          x-show="repository"
          x-data="{
            address: location.origin + location.pathname.replace(/index\\.html$/, ''),
            copied: false,
            async copy() {
              try {
                await navigator.clipboard.writeText(this.address);
              } catch {
                const field = this.$refs.address;
                field.select();
                document.execCommand('copy');
              }
              this.copied = true;
              setTimeout(() => (this.copied = false), 2000);
            },
          }"
        >
          <input
            x-ref="address"
            :value="address"
            readonly
            aria-label="Indirizzo del repository"
            class="flex-1 min-w-0 bg-transparent text-sm font-mono text-gray-300 outline-none truncate"
            @focus="$event.target.select()"
          />
          <button
            type="button"
            @click="copy()"
            class="shrink-0 py-1.5 px-4 text-sm rounded-full text-white transition-colors duration-100"
            :class="copied ? 'bg-green-600' : 'bg-white/15 hover:bg-white/25'"
            x-text="copied ? 'Copiato ✓' : 'Copia indirizzo'"
          ></button>
        </div>
        <p x-show="repository" class="mt-2 text-xs text-gray-400 text-center">
          Per aggiungerlo a mano: in Paperback Impostazioni › Estensioni › Repository › +,
          in Legendum Impostazioni › Fonti › Aggiungi repository › Paperback
        </p>`;

// Legendum opens `legendum://add-paperback-repo?url=…` the same way Paperback opens its own link.
const legendumButton = `
        <a
          class="inline-block leading-7 mt-4 mx-1 py-2 px-4 text-white bg-[#3d5a80] border-b border-[#2c4361] rounded-full transition-colors duration-100 hover:bg-[#4a6a94] hover:cursor-pointer"
          x-show="repository"
          :href="'legendum://add-paperback-repo?url=' + encodeURIComponent(location.origin + location.pathname.replace(/index\\.html$/, ''))"
        >
          Aggiungi a Legendum
        </a>`;

html = html.replace(
  button,
  `<div class="flex flex-wrap justify-center">\n        $1\n          Aggiungi a Paperback\n        $2${legendumButton}\n        </div>${addressBox}`,
);
html = html.replace(/<html lang="en">/, '<html lang="it">');
writeFileSync(path, html);
console.log(`${path}: address box added`);
