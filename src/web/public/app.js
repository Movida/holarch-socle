// Interface de l'étape 1 : lecture seule, sans framework. Toute donnée affichée passe par `h()` (échappement).
const $ = (s) => document.querySelector(s);
const h = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('fr-FR');
const abr = (n) => { if (n == null) return '—'; const a = Math.abs(n); return a >= 1e9 ? `${(n / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} G` : a >= 1e6 ? `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M` : a >= 1e4 ? `${Math.round(n / 1e3)} k` : nf.format(n); };
const usd = (n) => (n == null ? '—' : `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`);
const date = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const depuis = (iso) => { if (!iso) return '—'; const s = (Date.now() - Date.parse(iso)) / 1000; return s < 90 ? 'à l’instant' : s < 5400 ? `il y a ${Math.round(s / 60)} min` : s < 129600 ? `il y a ${Math.round(s / 3600)} h` : `il y a ${Math.round(s / 86400)} j`; };
const duree = (s) => (s == null ? '—' : s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`);
const api = async (p, o) => { const r = await fetch(p, o); if (!r.ok) throw new Error(`${p} : ${r.status}`); return r.json(); };

const TYPES = { memory: 'Mémoires', skill: 'Skills', hook: 'Hooks', project: 'Projets', node: 'Nœuds de l’arbre', instructions: 'Consignes', connector: 'Connecteurs', plugin: 'Plugins', plugin_marketplace: 'Marketplaces', agent_profile: 'Agents', rule: 'Règles' };
const type = (k) => TYPES[k] || k;

// ---------------------------------------------------------------- vues
async function tableau() {
  const [e, jours, projets, modeles] = await Promise.all([api('/api/etat'), api('/api/consommation?par=jour&jours=30'), api('/api/consommation?par=projet&jours=30'), api('/api/consommation?par=modele&jours=30')]);
  const t7 = e.tokens.find((t) => t.jours === 7) || {}; const t30 = e.tokens.find((t) => t.jours === 30) || {};
  const total = e.fiches_par_type.reduce((a, f) => a + f.n, 0);
  const cout = e.tarifs_configures ? usd(t30.usd) : 'inconnu';
  const partiel = e.sans_tarif_30j.length ? ` · hors ${e.sans_tarif_30j.map((m) => m.model).join(', ')}` : '';
  const noteCout = e.tarifs_configures ? `tarif liste${e.tarifs.releve ? `, grille du ${e.tarifs.releve}` : ''}${partiel}` : 'aucun tarif configuré';
  const max = Math.max(1, ...jours.map((j) => j.sortie || 0));
  const larg = 100 / Math.max(jours.length, 1);
  const histo = jours.length ? `<svg class="histo" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Tokens de sortie par jour">${jours.map((j, i) => {
    const hauteur = Math.max(0.5, ((j.sortie || 0) / max) * 36);
    return `<rect x="${i * larg + larg * 0.12}" y="${38 - hauteur}" width="${larg * 0.76}" height="${hauteur}" rx="0.4"><title>${h(j.cle)} : ${h(abr(j.sortie))} tokens de sortie</title></rect>`;
  }).join('')}</svg>` : '<div class="vide">Aucune activité importée.</div>';
  const maxP = Math.max(1, ...projets.map((p) => p.sortie || 0));
  return `
    <h1>Tableau de bord</h1>
    <p class="sous-titre">Ce qui est en place et ce qui s’est passé sur ce site.${e.dernier_inventaire ? ` Dernier inventaire ${h(depuis(e.dernier_inventaire.at))}.` : ''}</p>
    <div class="grille g4">
      <div class="carte tuile"><div class="libelle">Éléments en place</div><div class="valeur">${nf.format(total)}</div><div class="note">${e.fiches_par_type.length} types</div></div>
      <div class="carte tuile"><div class="libelle">Sessions sur 7 jours</div><div class="valeur">${nf.format(e.sessions.sept_jours)}</div><div class="note">${nf.format(e.sessions.total)} au total</div></div>
      <div class="carte tuile"><div class="libelle">Tokens de sortie, 7 j</div><div class="valeur">${abr(t7.sortie)}</div><div class="note">cache lu : ${abr(t7.cache_lu)}</div></div>
      <div class="carte tuile"><div class="libelle">Coût, 30 j</div><div class="valeur">${h(cout)}</div><div class="note"${e.tarifs.source ? ` title="${h(e.tarifs.source)}"` : ''}>${h(noteCout)}</div></div>
    </div>
    <div class="grille g2 section">
      <div class="carte"><h2>Activité — tokens de sortie par jour, 30 j</h2>${histo}</div>
      <div class="carte"><h2>Projets les plus actifs, 30 j</h2><div class="barres">${projets.slice(0, 8).map((p) => `
        <div class="barre"><span class="nom" title="${h(p.cle)}">${h(p.cle || '(sans projet)')}</span><span class="piste"><span class="rempli" style="width:${((p.sortie || 0) / maxP) * 100}%"></span></span><span class="chiffre"${p.usd != null ? ` title="${h(usd(p.usd))}"` : ''}>${abr(p.sortie)}</span></div>`).join('') || '<div class="vide">Rien sur la période.</div>'}</div></div>
    </div>
    <div class="carte tableau section"><table><thead><tr><th>Modèle, 30 j</th><th class="num">Entrée</th><th class="num">Cache écrit</th><th class="num">Cache lu</th><th class="num">Sortie</th><th class="num">Coût liste</th></tr></thead><tbody>
      ${modeles.map((m) => `<tr><td class="mono">${h(m.cle)}</td><td class="num">${abr(m.entree)}</td><td class="num">${abr(m.cache_ecrit)}</td><td class="num">${abr(m.cache_lu)}</td><td class="num">${abr(m.sortie)}</td><td class="num">${m.usd == null ? '<span class="discret">sans tarif</span>' : usd(m.usd)}</td></tr>`).join('') || '<tr><td colspan="6" class="vide">Rien sur la période.</td></tr>'}
    </tbody></table></div>
    <div class="grille g2 section">
      <div class="carte"><h2>Catalogue</h2><div class="puces">${e.fiches_par_type.map((f) => `<a class="puce" href="#/catalogue?kind=${encodeURIComponent(f.kind)}"><b>${nf.format(f.n)}</b> ${h(type(f.kind))}</a>`).join('')}</div></div>
      <div class="carte"><h2>À regarder</h2>${e.projets_sales.length ? `<div class="barres">${e.projets_sales.map((p) => `<div><span class="badge alerte">${nf.format(p.n)} fichier(s) non commité(s)</span> ${h(p.name)}</div>`).join('')}</div>` : '<div class="discret">Rien à signaler.</div>'}</div>
    </div>`;
}

async function catalogue(params) {
  const kind = params.get('kind') || ''; const q = params.get('q') || '';
  const [e, fiches] = await Promise.all([api('/api/etat'), api(`/api/fiches?${new URLSearchParams({ ...(kind && { kind }), ...(q && { q }) })}`)]);
  return `
    <h1>Catalogue</h1>
    <p class="sous-titre">Tout ce qui est en place. Ce qui n’y figure pas n’existe pas pour le système.</p>
    <div class="outils">
      <input type="search" id="recherche" placeholder="Rechercher un nom, une description, un chemin…" value="${h(q)}">
      <div class="puces"><a class="puce ${kind ? '' : 'actif'}" href="#/catalogue">Tout</a>${e.fiches_par_type.map((f) => `<a class="puce ${f.kind === kind ? 'actif' : ''}" href="#/catalogue?kind=${encodeURIComponent(f.kind)}"><b>${f.n}</b> ${h(type(f.kind))}</a>`).join('')}</div>
    </div>
    <div class="carte tableau"><table><thead><tr><th>Nom</th><th>Type</th><th>Où</th><th>Statut</th></tr></thead><tbody>
      ${fiches.map((f) => `<tr class="cliquable" data-fiche="${h(f.id)}"><td><div>${h(f.name)}</div><div class="desc">${h(f.description || '')}</div></td><td><span class="badge">${h(type(f.kind))}</span></td><td class="mono desc">${h(f.attributes?.projet || f.attributes?.projet_claude || f.attributes?.depot || '')}</td><td><span class="badge ${f.status === 'active' ? 'ok' : f.status === 'proposed' ? 'accent' : ''}">${h(f.status)}</span></td></tr>`).join('') || '<tr><td colspan="4" class="vide">Aucun élément.</td></tr>'}
    </tbody></table></div>`;
}

async function sessions(params) {
  const projet = params.get('projet') || '';
  const toutes = await api('/api/sessions?jours=90');
  const projets = [...new Set(toutes.map((s) => s.data.projet).filter(Boolean))].sort();
  const liste = projet ? toutes.filter((s) => s.data.projet === projet) : toutes;
  return `
    <h1>Sessions</h1>
    <p class="sous-titre">Sessions Claude Code des 90 derniers jours, sous-agents rattachés à leur session.</p>
    <div class="outils"><select id="projet"><option value="">Tous les projets (${toutes.length})</option>${projets.map((p) => `<option ${p === projet ? 'selected' : ''}>${h(p)}</option>`).join('')}</select></div>
    <div class="carte tableau"><table><thead><tr><th>Fin</th><th>Projet</th><th class="num">Durée</th><th class="num">Tours</th><th class="num">Sous-agents</th><th class="num">Sortie</th><th class="num">Cache lu</th><th class="num">Coût</th><th>Modèle</th></tr></thead><tbody>
      ${liste.map((s) => `<tr><td title="${h(s.session)}">${h(date(s.fin))}</td><td>${h(s.data.projet || '—')}${s.data.branche ? ` <span class="discret">${h(s.data.branche)}</span>` : ''}</td><td class="num">${h(duree(s.data.duree_s))}</td><td class="num">${nf.format(s.data.tours || 0)}</td><td class="num">${s.sous_agents || ''}</td><td class="num">${abr(s.sortie)}</td><td class="num">${abr(s.cache_lu)}</td><td class="num">${usd(s.usd)}</td><td class="mono desc">${h((s.data.modeles || []).join(', '))}</td></tr>`).join('') || '<tr><td colspan="9" class="vide">Aucune session.</td></tr>'}
    </tbody></table></div>`;
}

async function journal(params) {
  const kind = params.get('kind') || '';
  const ev = await api(`/api/evenements?limite=300${kind ? `&kind=${encodeURIComponent(kind)}` : ''}`);
  const familles = ['session', 'cost', 'element', 'inventory'];
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
  const champs = [['Type', type(f.kind)], ['Statut', f.status], ['Description', f.description], ['Emplacement', f.location], ['Site', f.site], ['Nœud', f.node], ['Version', f.version], ['Classification', f.classification], ['Provenance', f.provenance?.source], ['Dernier usage', f.usage?.last_used ? date(f.usage.last_used) : null]].filter(([, v]) => v);
  t.innerHTML = `<button class="fermer" type="button" id="fermer">Fermer</button><h2>${h(f.name)}</h2><div class="mono discret">${h(f.id)}</div>
    <dl class="champs">${champs.map(([k, v]) => `<dt>${h(k)}</dt><dd>${h(v)}</dd>`).join('')}</dl>
    ${f.attributes ? `<h2>Attributs</h2><pre>${h(JSON.stringify(f.attributes, null, 2))}</pre>` : ''}
    ${f.links && Object.keys(f.links).length ? `<h2>Liens</h2><pre>${h(JSON.stringify(f.links, null, 2))}</pre>` : ''}
    <h2>Événements</h2>${r.evenements.length ? r.evenements.map((e) => `<div class="evenement"><span>${h(date(e.at))}</span><span class="badge accent">${h(e.kind)}</span><span class="discret">${h(e.actor)}</span></div>`).join('') : '<div class="discret">Aucun.</div>'}`;
  $('#fermer').onclick = () => { t.hidden = true; };
}

// ---------------------------------------------------------------- routeur
const VUES = { '': ['tableau', tableau], catalogue: ['catalogue', catalogue], sessions: ['sessions', sessions], journal: ['journal', journal], arbre: ['arbre', arbre] };
async function router() {
  const [chemin, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const [nom, vue] = VUES[chemin] || VUES[''];
  document.querySelectorAll('.nav nav a').forEach((a) => a.classList.toggle('actif', a.dataset.vue === nom));
  $('#vue').innerHTML = '<p class="chargement">Chargement…</p>';
  try { $('#vue').innerHTML = await vue(new URLSearchParams(qs || '')); } catch (e) { $('#vue').innerHTML = `<div class="carte"><b>Erreur</b> : ${h(e.message)}</div>`; }
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
