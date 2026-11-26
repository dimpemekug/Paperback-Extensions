# Sviluppo

Note per chi modifica le estensioni di questo repository.


| Estensione | Sito | Cosa fa |
|---|---|---|
| `MangaWorldITA` | [www.mangaworld.me](https://www.mangaworld.me) | Esplora (tendenze, ultimi capitoli, più letti, ultime aggiunte, più votati, generi, tipologie), ricerca con ordinamenti e filtri, dettagli, capitoli, pagine |

## Aggiungere il repository

Il workflow pubblica il repository su GitHub Pages a ogni push su `master`:

```
https://dimpemekug.github.io/Paperback-Extensions/
```

- **Legendum**: Impostazioni › Fonti › Aggiungi repository › Paperback, e incolla l'indirizzo qui sopra.
- **Paperback**: apri `paperback://addRepo?url=https://dimpemekug.github.io/Paperback-Extensions/`
  oppure Impostazioni › Estensioni › Repository › aggiungi l'indirizzo.

## Se MangaWorld cambia di nuovo indirizzo

Nelle impostazioni della fonte c'è il campo **Dominio**: basta scriverci il nuovo indirizzo
(per esempio `https://www.mangaworld.xx`), senza aggiornare l'estensione. Se cambia anche il tema,
vanno aggiornati i selettori in `src/MangaWorldITA/parsers.ts` e le pagine di prova in `tests/fixtures/`.

## Struttura

```
src/MangaWorldITA/
├── pbconfig.ts     nome, versione, lingua, capacità
├── main.ts         l'estensione: rete, sezioni, ricerca, impostazioni
├── parsers.ts      lettura dell'HTML, senza dipendenze da Paperback (provabile offline)
└── static/icon.png
scripts/            customize-homepage.mjs: pulsante Legendum, indirizzo e «Copia indirizzo» nella pagina
assets/             icone in SVG (static/icon.png si rigenera con rsvg-convert)
src/tests/          suite live di paperback-cli (sito vero)
tests/              test offline dei parser sulle pagine salvate in tests/fixtures/
```

## Comandi

```bash
npm install
npm test            # controllo dei tipi + test offline dei parser
npm run test:live   # suite di paperback-cli contro il sito vero (scarica Node 24 con npx)
npm run bundle      # crea bundles/ (versioning.json, index.js, icona)
rsvg-convert -w 512 -h 512 assets/icon-mangaworld.svg -o src/MangaWorldITA/static/icon.png
rsvg-convert -w 256 -h 256 assets/icon-extensions.svg -o assets/icon-extensions.png   # icona del repository
npm run serve       # serve bundles/ in rete locale, per provarla su iPhone prima del push
```

Per pubblicare una nuova versione: alza `version` in `src/MangaWorldITA/pbconfig.ts`, poi push.
Le app vedono l'aggiornamento solo se la versione cambia.

## Cosa resta fuori

- **Test live in CI**: il sito può bloccare gli indirizzi di GitHub Actions, quindi la CI esegue solo i
  test offline. La suite live va lanciata a mano prima di un rilascio.
- **Bookmark e voti del sito**: servono l'account MangaWorld; l'estensione legge solo pagine pubbliche.
- **MangaWorldAdult**: è un sito a parte, non incluso.

## Controlli a mano nell'app

1. Aggiungi il repository e installa *MangaWorld ITA*.
2. Esplora: le sezioni si aprono e scorrono alla pagina successiva; un genere apre una ricerca filtrata.
3. Cerca "one piece", apri la serie, controlla trama, generi e numero di capitoli.
4. Leggi un capitolo fino in fondo e scaricane uno.
5. Impostazioni della fonte: cambia il dominio e poi ripristinalo.
