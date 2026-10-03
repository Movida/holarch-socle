// Interface de l'étape 1 : lecture seule, sans framework. Toute donnée affichée passe par `h()` (échappement).
const $ = (s) => document.querySelector(s);
const h = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('fr-FR');
const abr = (n) => { if (n == null) return '—'; const a = Math.abs(n); const f = (x, u) => `${x.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${u}`; return a >= 1e9 ? f(n / 1e9, 'Md') : a >= 1e6 ? f(n / 1e6, 'M') : a >= 1e3 ? f(n / 1e3, 'k') : nf.format(n); };
const jj = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
// Colonne numérique triable : la valeur brute en data-v, l'affichage abrégé dans la cellule.
const num = (v, affiche) => `<td class="num" data-v="${v ?? -1}">${affiche}</td>`;
const usd = (n) => (n == null ? '—' : `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`);
const date = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const depuis = (iso) => { if (!iso) return '—'; const s = (Date.now() - Date.parse(iso)) / 1000; return s < 90 ? 'à l’instant' : s < 5400 ? `il y a ${Math.round(s / 60)} min` : s < 129600 ? `il y a ${Math.round(s / 3600)} h` : `il y a ${Math.round(s / 86400)} j`; };
const duree = (s) => (s == null ? '—' : s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`);
const api = async (p, o) => { const r = await fetch(p, o); if (!r.ok) throw new Error(`${p} : ${r.status}`); return r.json(); };

const TYPES = { memory: 'Mémoires', skill: 'Skills', hook: 'Hooks', project: 'Projets', node: 'Nœuds de l’arbre', instructions: 'Consignes', connector: 'Connecteurs', plugin: 'Plugins', plugin_marketplace: 'Marketplaces', agent_profile: 'Agents', rule: 'Règles', container: 'Conteneurs', volume: 'Volumes Docker' };
const type = (k) => TYPES[k] || k;
// Un nœud de l'arbre s'affiche avec son statut d'arbre (draft, stable), comme sur la page Arbre ; le statut de fiche
// (contrat du catalogue) reste dans le détail.
const statut = (f) => (f.kind === 'node' && f.attributes?.statut) || f.status;
const ORIGINES = { humain: 'Par vous', classifieur: 'Classifieur (mode auto)', regle: 'Règle de permission', securite: 'Contrôle de sécurité', hook: 'Hook' };

// ---------------------------------------------------------------- vues
const PERIODES = [7, 30, 90];
async function tableau(params) {
  const n = PERIODES.includes(+params.get('jours')) ? +params.get('jours') : 30;
  const [e, jours, projets, modeles] = await Promise.all([api(`/api/etat?jours=${n}`), api(`/api/consommation?par=jour&jours=${n}`), api(`/api/consommation?par=projet&jours=${n}`), api(`/api/consommation?par=modele&jours=${n}`)]);
  const p = e.periode; const t = p.tokens;
  const total = e.fiches_par_type.reduce((a, f) => a + f.n, 0);
  const cout = e.tarifs_configures ? usd(t.usd) : 'inconnu';
  const sansTarif = p.sans_tarif.map((m) => m.model);
  const partiel = sansTarif.length ? ` · hors ${sansTarif.length} modèle${sansTarif.length > 1 ? 's' : ''} sans tarif` : '';
  const noteCout = e.tarifs_configures ? `tarif liste${e.tarifs.releve ? `, grille du ${e.tarifs.releve}` : ''}${partiel}` : 'aucun tarif configuré';
  const bulleCout = [e.tarifs.source && `Grille : ${e.tarifs.source}`, sansTarif.length && `Sans tarif : ${sansTarif.join(', ')}`].filter(Boolean).join('\n');
  // Toute la plage (dates UTC, comme le regroupement côté serveur) : un jour sans activité vaut zéro.
  const parJour = Object.fromEntries(jours.map((j) => [j.cle, j]));
  const plage = Array.from({ length: n }, (_, i) => new Date(Date.now() - (n - 1 - i) * 864e5).toISOString().slice(0, 10));
  const max = Math.max(1, ...jours.map((j) => j.sortie || 0));
  const larg = 100 / plage.length;
  const histo = jours.length ? `<svg class="histo" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Tokens de sortie par jour, ${n} jours">${plage.map((d, i) => {
    const sortie = parJour[d]?.sortie || 0; const hauteur = sortie ? Math.max(0.5, (sortie / max) * 36) : 0.3;
    return `<a href="#/sessions?jour=${d}"><rect class="${sortie ? '' : 'nul'}" x="${i * larg + larg * 0.12}" y="${38 - hauteur}" width="${larg * 0.76}" height="${hauteur}" rx="0.4"><title>${jj(d)} : ${h(abr(sortie))} tokens de sortie${sortie ? ' — voir les sessions' : ''}</title></rect></a>`;
  }).join('')}</svg><div class="axe">${[0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1].map((i) => `<span>${jj(plage[i])}</span>`).join('')}</div>` : '<div class="vide">Aucune activité importée.</div>';
  const maxP = Math.max(1, ...projets.map((p) => p.sortie || 0));
  const absentes = e.dernier_inventaire?.absentes || [];
  const refus = p.refus.par_origine; const maxR = Math.max(1, ...refus.map((r) => r.n));
  return `
    <div class="entete"><h1>Tableau de bord</h1><div class="puces" role="group" aria-label="Période">${PERIODES.map((j) => `<a class="puce ${j === n ? 'actif' : ''}" href="#/?jours=${j}">${j} j</a>`).join('')}</div></div>
    <p class="sous-titre">Ce qui est en place, et ce qui s’est passé sur ce site ces ${n} derniers jours.${e.dernier_inventaire ? ` Dernier inventaire ${h(depuis(e.dernier_inventaire.at))}.` : ''}</p>
    <div class="grille g4">
      <div class="carte tuile"><div class="libelle">Éléments en place</div><div class="valeur">${nf.format(total)}</div><div class="note">${e.fiches_par_type.length} types</div></div>
      <div class="carte tuile"><div class="libelle">Sessions, ${n} j</div><div class="valeur">${nf.format(p.sessions)}</div><div class="note">${nf.format(e.sessions.total)} au total</div></div>
      <div class="carte tuile"><div class="libelle">Tokens de sortie, ${n} j</div><div class="valeur">${abr(t.sortie)}</div><div class="note">cache lu : ${abr(t.cache_lu)}</div></div>
      <div class="carte tuile"><div class="libelle">Coût, ${n} j</div><div class="valeur">${h(cout)}</div><div class="note"${bulleCout ? ` title="${h(bulleCout)}"` : ''}>${h(noteCout)}</div></div>
    </div>
    <div class="grille g2 section">
      <div class="carte"><h2>Activité — tokens de sortie par jour, ${n} j</h2>${histo}</div>
      <div class="carte"><h2>Projets les plus actifs, ${n} j</h2><div class="barres">${projets.slice(0, 8).map((p) => `
        <div class="barre"><span class="nom" title="${h(p.cle)}">${h(p.cle || '(sans projet)')}</span><span class="piste"><span class="rempli" style="width:${((p.sortie || 0) / maxP) * 100}%"></span></span><span class="chiffre"${p.usd != null ? ` title="${h(usd(p.usd))}"` : ''}>${abr(p.sortie)}</span></div>`).join('') || '<div class="vide">Rien sur la période.</div>'}</div></div>
    </div>
    <div class="carte tableau section"><table class="triable"><thead><tr><th>Modèle, ${n} j</th><th class="num">Entrée</th><th class="num">Cache écrit</th><th class="num">Cache lu</th><th class="num">Sortie</th><th class="num" data-sens="desc">Coût liste</th></tr></thead><tbody>
      ${[...modeles].sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1)).map((m) => `<tr><td class="mono">${h(m.cle)}</td>${num(m.entree, abr(m.entree))}${num(m.cache_ecrit, abr(m.cache_ecrit))}${num(m.cache_lu, abr(m.cache_lu))}${num(m.sortie, abr(m.sortie))}${num(m.usd, m.usd == null ? '<span class="discret">sans tarif</span>' : usd(m.usd))}</tr>`).join('') || '<tr><td colspan="6" class="vide">Rien sur la période.</td></tr>'}
    </tbody></table></div>
    <div class="section">
      <div class="carte"><h2>Refus d’outil, ${n} j</h2>${refus.length ? `<div class="barres">${refus.map((r) => `
        <div class="barre"><span class="nom">${h(ORIGINES[r.cle] || r.cle)}</span><span class="piste"><span class="rempli" style="width:${(r.n / maxR) * 100}%"></span></span><span class="chiffre">${nf.format(r.n)}</span></div>`).join('')}</div>
        <p class="discret">Outils les plus refusés : ${p.refus.par_outil.map((o) => `${h(o.cle || '?')} (${nf.format(o.n)})`).join(', ')}</p>` : '<div class="discret">Aucun refus sur la période.</div>'}</div>
    </div>
    <div class="grille g2 section">
      <div class="carte"><h2>Catalogue</h2><div class="puces">${e.fiches_par_type.map((f) => `<a class="puce" href="#/catalogue?kind=${encodeURIComponent(f.kind)}"><b>${nf.format(f.n)}</b> ${h(type(f.kind))}</a>`).join('')}</div>
        ${absentes.length ? `<p class="discret" title="${h(absentes.join('\n'))}">Non vu sur ce site : ${h(absentes.map((a) => a.split(' : ')[0]).join(', '))}</p>` : ''}</div>
      <div class="carte"><h2>À regarder</h2>${e.projets_sales.length || e.memoires_doubles.length ? `<div class="barres">${e.projets_sales.map((p) => `<div><span class="badge alerte">${nf.format(p.n)} fichier(s) non commité(s)</span> ${h(p.name)}</div>`).join('')}${e.memoires_doubles.map((m) => `<div title="${h(m.projets || '')}"><span class="badge alerte">mémoire en ${m.n} exemplaires</span> ${h(m.name)}</div>`).join('')}</div>` : '<div class="discret">Rien à signaler.</div>'}</div>
    </div>`;
}

async function catalogue(params) {
  const kind = params.get('kind') || ''; const q = params.get('q') || '';
  const [e, fiches] = await Promise.all([api('/api/etat'), api(`/api/fiches?${new URLSearchParams({ ...(kind && { kind }), ...(q && { q }) })}`)]);
  return `
    <h1>Catalogue</h1>
    <p class="sous-titre">Tout ce qui est en place. Ce qui n’y figure pas n’existe pas pour le système.</p>
    <div class="outils">
      <input type="search" id="recherche" placeholder="Nom, description, chemin…" title="Rechercher un nom, une description ou un chemin" value="${h(q)}">
      <div class="puces"><a class="puce ${kind ? '' : 'actif'}" href="#/catalogue">Tout</a>${e.fiches_par_type.map((f) => `<a class="puce ${f.kind === kind ? 'actif' : ''}" href="#/catalogue?kind=${encodeURIComponent(f.kind)}"><b>${f.n}</b> ${h(type(f.kind))}</a>`).join('')}</div>
    </div>
    <div class="carte tableau"><table><thead><tr><th>Nom</th><th>Type</th><th>Où</th><th>Statut</th></tr></thead><tbody>
      ${fiches.map((f) => `<tr class="cliquable" data-fiche="${h(f.id)}"><td><div>${h(f.name)}</div><div class="desc">${h(f.description || '')}</div></td><td><span class="badge">${h(type(f.kind))}</span></td><td class="mono desc">${h(f.attributes?.projet || f.attributes?.projet_claude || f.attributes?.depot || '')}</td><td><span class="badge ${statut(f) === 'active' || statut(f) === 'stable' ? 'ok' : statut(f) === 'proposed' || statut(f) === 'draft' ? 'accent' : ''}">${h(statut(f))}</span></td></tr>`).join('') || '<tr><td colspan="4" class="vide">Aucun élément.</td></tr>'}
    </tbody></table></div>`;
}

async function sessions(params) {
  const projet = params.get('projet') || ''; const jour = params.get('jour') || '';
  const toutes = await api('/api/sessions?jours=90');
  const projets = [...new Set(toutes.map((s) => s.data.projet).filter(Boolean))].sort();
  const liste = toutes.filter((s) => (!projet || s.data.projet === projet) && (!jour || s.fin.slice(0, 10) === jour));
  return `
    <h1>Sessions</h1>
    <p class="sous-titre">Sessions Claude Code des 90 derniers jours, sous-agents rattachés à leur session.</p>
    <div class="outils"><select id="projet"><option value="">Tous les projets (${toutes.length} sur 90 j)</option>${projets.map((p) => `<option ${p === projet ? 'selected' : ''}>${h(p)}</option>`).join('')}</select>${jour ? `<a class="puce actif" href="#/sessions" title="Retirer le filtre">${jj(jour)} ✕</a>` : ''}</div>
    <div class="carte tableau"><table class="triable"><thead><tr><th>Fin</th><th>Projet</th><th class="num">Durée</th><th class="num">Tours</th><th class="num">Sous-agents</th><th class="num">Refus</th><th class="num">Sortie</th><th class="num">Cache lu</th><th class="num">Coût</th><th class="num" title="Coût de la session (sous-agents compris) divisé par ses tours : il monte quand chaque tour relit un long contexte">Coût / tour</th><th>Modèle</th></tr></thead><tbody>
      ${liste.map((s) => `<tr><td title="${h(s.session)}" data-v="${Date.parse(s.fin)}">${h(date(s.fin))}</td><td>${h(s.data.projet || '—')}${s.data.branche ? ` <span class="discret">${h(s.data.branche)}</span>` : ''}</td>${num(s.data.duree_s, h(duree(s.data.duree_s)))}${num(s.data.tours || 0, nf.format(s.data.tours || 0))}${num(s.sous_agents || 0, s.sous_agents || '')}${num(s.refus || 0, s.refus || '')}${num(s.sortie, abr(s.sortie))}${num(s.cache_lu, abr(s.cache_lu))}${num(s.usd, usd(s.usd))}${(() => { const pt = s.usd != null && s.tours_total ? s.usd / s.tours_total : null; return `<td class="num" data-v="${pt ?? -1}"${s.tours_total ? ` title="contexte relu en moyenne : ${h(abr(Math.round((s.cache_lu || 0) / s.tours_total)))} tokens par tour"` : ''}>${pt == null ? '—' : `${pt.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`}</td>`; })()}<td class="mono desc">${h((s.data.modeles || []).join(', '))}</td></tr>`).join('') || '<tr><td colspan="11" class="vide">Aucune session.</td></tr>'}
    </tbody></table></div>`;
}

async function journal(params) {
  const kind = params.get('kind') || '';
  const ev = await api(`/api/evenements?limite=300${kind ? `&kind=${encodeURIComponent(kind)}` : ''}`);
  const familles = ['session', 'cost', 'tool', 'element', 'inventory'];
  return `
    <h1>Journal</h1>
    <p class="sous-titre">Les 300 derniers événements. Ce qui n’est pas au journal ne s’est pas passé.</p>
    <div class="outils"><div class="puces"><a class="puce ${kind ? '' : 'actif'}" href="#/journal">Tout</a>${familles.map((f) => `<a class="puce ${f === kind ? 'actif' : ''}" href="#/journal?kind=${f}">${f}</a>`).join('')}</div></div>
    <div class="carte">${ev.map((e) => `<div class="evenement"><span title="${h(e.at)}">${h(date(e.at))}</span><span><span class="badge accent">${h(e.kind)}</span></span><span>${h(e.data?.projet || e.subject || '')} <span class="discret">${h(e.actor)}${e.tok_out ? ` · ${abr(e.tok_out)} tokens de sortie` : ''}${e.data?.fiches != null ? ` · ${e.data.fiches} fiches` : ''}</span></span></div>`).join('') || '<div class="vide">Journal vide.</div>'}</div>`;
}

async function arbre() {
  const noeuds = await api('/api/arbre');
  const parChemin = new Map(noeuds.map((n) => [n.chemin, n]));
  const enfants = new Map();
  const racines = [];
  for (const n of noeuds) {
    if (n.parent && parChemin.has(n.parent) && n.parent !== n.chemin) { if (!enfants.has(n.parent)) enfants.set(n.parent, []); enfants.get(n.parent).push(n); } else racines.push(n);
  }
  const rendre = (n) => `<li><div class="noeud" data-fiche="${h(n.id)}" style="cursor:pointer"><span class="t">${h(n.titre)}</span><span class="badge">${h(n.type)}</span><span class="badge ${n.statut === 'stable' ? 'ok' : 'accent'}">${h(n.statut || '—')}</span>${n.version ? `<span class="badge">${h(n.version)}</span>` : ''}<span class="d">${h(n.description || '')}</span></div>${enfants.has(n.chemin) ? `<ul>${enfants.get(n.chemin).map(rendre).join('')}</ul>` : ''}</li>`;
  const parDepot = Map.groupBy ? Map.groupBy(racines, (n) => n.depot) : new Map([[null, racines]]);
  return `
    <h1>Arbre</h1>
    <p class="sous-titre">Les intentions, de la ligne directrice aux décisions. Un nœud en <span class="badge accent">draft</span> est une proposition ; seul le <span class="badge ok">stable</span> oblige.</p>
    ${[...parDepot].map(([depot, rs]) => `<div class="carte arbre section"><h2>${h(depot || '')}</h2><ul>${rs.map(rendre).join('')}</ul></div>`).join('') || '<div class="carte vide">Aucun arbre trouvé.</div>'}`;
}

async function ouvrirFiche(id) {
  const t = $('#tiroir');
  t.hidden = false; t.innerHTML = '<p class="chargement">Chargement…</p>';
  const r = await api(`/api/fiche?id=${encodeURIComponent(id)}`);
  if (!r) { t.innerHTML = '<p>Introuvable.</p>'; return; }
  const f = r.fiche;
  const champs = [['Type', type(f.kind)], ['Statut', f.status], ['Statut dans l’arbre', f.kind === 'node' ? f.attributes?.statut : null], ['Description', f.description], ['Emplacement', f.location], ['Site', f.site], ['Nœud', f.node], ['Version', f.version], ['Classification', f.classification], ['Provenance', f.provenance?.source], ['Dernier usage', f.usage?.last_used ? date(f.usage.last_used) : null]].filter(([, v]) => v);
  t.innerHTML = `<button class="fermer" type="button" id="fermer">Fermer</button><h2>${h(f.name)}</h2><div class="mono discret">${h(f.id)}</div>
    <dl class="champs">${champs.map(([k, v]) => `<dt>${h(k)}</dt><dd>${h(v)}</dd>`).join('')}</dl>
    ${f.attributes ? `<h2>Attributs</h2><pre>${h(JSON.stringify(f.attributes, null, 2))}</pre>` : ''}
    ${f.links && Object.keys(f.links).length ? `<h2>Liens</h2><pre>${h(JSON.stringify(f.links, null, 2))}</pre>` : ''}
    <h2>Événements</h2>${r.evenements.length ? r.evenements.map((e) => `<div class="evenement"><span>${h(date(e.at))}</span><span class="badge accent">${h(e.kind)}</span><span class="discret">${h(e.actor)}</span></div>`).join('') : '<div class="discret">Aucun.</div>'}`;
  $('#fermer').onclick = () => { t.hidden = true; };
}

// ---------------------------------------------------------------- routeur
const DERNIERES = {};
function triables() {
  document.querySelectorAll('table.triable').forEach((t) => t.querySelectorAll('th').forEach((th, i) => {
    th.onclick = () => {
      const asc = th.dataset.sens === 'desc';
      t.querySelectorAll('th').forEach((x) => delete x.dataset.sens); th.dataset.sens = asc ? 'asc' : 'desc';
      const v = (r) => { const c = r.cells[i]; return c?.dataset.v !== undefined ? +c.dataset.v : (c?.textContent || '').trim().toLowerCase(); };
      const lignes = [...t.tBodies[0].rows].filter((r) => r.cells.length > 1);
      lignes.sort((a, b) => { const x = v(a); const y = v(b); return (x > y ? 1 : x < y ? -1 : 0) * (asc ? 1 : -1); }).forEach((r) => t.tBodies[0].appendChild(r));
    };
  }));
}
const VUES = { '': ['tableau', tableau], catalogue: ['catalogue', catalogue], sessions: ['sessions', sessions], journal: ['journal', journal], arbre: ['arbre', arbre] };
async function router() {
  const [chemin, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const [nom, vue] = VUES[chemin] || VUES[''];
  document.querySelectorAll('.nav nav a').forEach((a) => a.classList.toggle('actif', a.dataset.vue === nom));
  // La dernière version de la vue s'affiche tout de suite, puis se remplace par les données fraîches.
  $('#vue').innerHTML = DERNIERES[location.hash] || '<p class="chargement">Chargement…</p>';
  try { const html = await vue(new URLSearchParams(qs || '')); DERNIERES[location.hash] = html; $('#vue').innerHTML = html; } catch (e) { $('#vue').innerHTML = `<div class="carte"><b>Erreur</b> : ${h(e.message)}</div>`; }
  triables();
  const rech = $('#recherche');
  if (rech) rech.onchange = () => { const p = new URLSearchParams(qs || ''); rech.value ? p.set('q', rech.value) : p.delete('q'); location.hash = `#/catalogue?${p}`; };
  const pr = $('#projet');
  if (pr) pr.onchange = () => { location.hash = pr.value ? `#/sessions?projet=${encodeURIComponent(pr.value)}` : '#/sessions'; };
}
document.addEventListener('click', (ev) => { const el = ev.target.closest('[data-fiche]'); if (el) ouvrirFiche(el.dataset.fiche); });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') $('#tiroir').hidden = true; });
$('#rafraichir').onclick = async (ev) => {
  const b = ev.currentTarget; b.disabled = true; b.textContent = 'Rafraîchissement…';
  try { await api('/api/rafraichir', { method: 'POST' }); await router(); } finally { b.disabled = false; b.textContent = 'Rafraîchir'; }
};
api('/api/etat').then((e) => { $('#site').textContent = `site ${e.site}`; }).catch(() => {});
window.addEventListener('hashchange', router);
router();
