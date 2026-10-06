// Interface de l'étape 1 : lecture seule, sans framework. Toute donnée affichée passe par `h()` (échappement).
const $ = (s) => document.querySelector(s);
const h = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('fr-FR');
const abr = (n) => { if (n == null) return '—'; const a = Math.abs(n); const f = (x, u) => `${x.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${u}`; return a >= 1e9 ? f(n / 1e9, 'Md') : a >= 1e6 ? f(n / 1e6, 'M') : a >= 1e3 ? f(n / 1e3, 'k') : nf.format(n); };
const jj = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
// Colonne numérique triable : la valeur brute en data-v, l'affichage abrégé dans la cellule.
const num = (v, affiche) => `<td class="num" data-v="${v ?? -1}">${affiche}</td>`;
const usd = (n) => (n == null ? '—' : `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`);
const dateCourte = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const dateSec = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' }) : '—');
const court = (m) => String(m).replace(/^(anthropic\/)?claude-/, ''); // claude-opus-5-5 → opus-5-5 ; l'identifiant complet reste en infobulle
const pct = (x, n) => `${Math.round((100 * x) / n)} %`;
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
  const ct = p.cout_par_type; const tot = Object.values(ct).reduce((a, x) => a + x, 0);
  const parType = tot ? [['cache lu', ct.cache_lu], ['sortie', ct.sortie], ['cache écrit', ct.cache_ecrit], ['entrée', ct.entree]].sort((a, b) => b[1] - a[1]) : [];
  const noteCout = e.tarifs_configures ? `${parType.length ? `dont ${parType[0][0]} ${pct(parType[0][1], tot)} · ` : ''}tarif liste${e.tarifs.releve ? `, grille du ${e.tarifs.releve}` : ''}${partiel}` : 'aucun tarif configuré';
  const bulleCout = [parType.length && `Par type de tokens : ${parType.map(([k, v]) => `${k} ${usd(v)} (${pct(v, tot)})`).join(', ')}`, 'Prix liste de l’API, pas une facture : un abonnement se paie autrement.', e.tarifs.source && `Grille : ${e.tarifs.source}`, sansTarif.length && `Sans tarif : ${sansTarif.join(', ')}`].filter(Boolean).join('\n');
  // Toute la plage (dates UTC, comme le regroupement côté serveur) : un jour sans activité vaut zéro.
  const parJour = Object.fromEntries(jours.map((j) => [j.cle, j]));
  const plage = Array.from({ length: n }, (_, i) => new Date(Date.now() - (n - 1 - i) * 864e5).toISOString().slice(0, 10));
  const max = Math.max(1, ...jours.map((j) => j.sortie || 0));
  const larg = 100 / plage.length;
  const histo = jours.length ? `<svg class="histo" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Tokens de sortie par jour, ${n} jours">${plage.map((d, i) => {
    const sortie = parJour[d]?.sortie || 0; const hauteur = sortie ? Math.max(1.5, (sortie / max) * 36) : 0.3;
    return `<a href="#/sessions?jour=${d}"><rect class="${sortie ? '' : 'nul'}" x="${i * larg + larg * 0.12}" y="${38 - hauteur}" width="${larg * 0.76}" height="${hauteur}" rx="0.4"><title>${jj(d)} : ${h(abr(sortie))} tokens de sortie${sortie ? ' — voir les sessions' : ''}</title></rect></a>`;
  }).join('')}</svg><div class="axe">${[0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1].map((i) => `<span>${jj(plage[i])}</span>`).join('')}</div>` : '<div class="vide">Aucune activité importée.</div>';
  const maxP = Math.max(1, ...projets.map((p) => p.sortie || 0));
  const absentes = e.dernier_inventaire?.absentes || [];
  const maxM = Math.max(1, ...p.mcp.map((m) => m.n));
  const refus = p.refus.par_origine; const maxR = Math.max(1, ...refus.map((r) => r.n));
  return `
    <div class="entete"><h1>Tableau de bord</h1><div class="puces" role="group" aria-label="Période">${PERIODES.map((j) => `<a class="puce ${j === n ? 'actif' : ''}" href="#/?jours=${j}">${j} j</a>`).join('')}</div></div>
    <p class="sous-titre">Ce qui est en place, et ce qui s’est passé sur ce site ces ${n} derniers jours.${e.dernier_inventaire ? ` Dernier inventaire ${h(depuis(e.dernier_inventaire.at))}.` : ''}</p>
    <div class="grille g4">
      <div class="carte tuile"><div class="libelle">Éléments en place</div><div class="valeur">${nf.format(total)}</div><div class="note">${e.fiches_par_type.length} types</div></div>
      <div class="carte tuile"><div class="libelle">Sessions, ${n} j</div><div class="valeur">${nf.format(p.sessions)}</div><div class="note">${nf.format(e.sessions.total)} au total</div></div>
      <div class="carte tuile"><div class="libelle">Tokens de sortie, ${n} j</div><div class="valeur">${abr(t.sortie)}</div><div class="note">cache lu : ${abr(t.cache_lu)}</div></div>
      <div class="carte tuile"><div class="libelle">Coût équivalent API, ${n} j</div><div class="valeur">${h(cout)}</div><div class="note"${bulleCout ? ` title="${h(bulleCout)}"` : ''}>${h(noteCout)}</div></div>
    </div>
    <div class="grille g2 section">
      <div class="carte"><h2>Activité — tokens de sortie par jour, ${n} j${jours.length ? ` <span class="discret">· pic ${h(abr(max))}</span>` : ''}</h2>${histo}</div>
      <div class="carte"><h2>Projets les plus actifs, ${n} j</h2><div class="barres">${projets.slice(0, 8).map((p) => `
        <div class="barre"><a class="nom" title="Sessions de ${h(p.nom || p.cle || 'hors projet')} (coût d’une session partagé entre ses projets)" href="#/sessions?projet=${encodeURIComponent(p.cle || 'aucun')}">${h(p.nom || p.cle || '(hors projet)')}</a><span class="piste"><span class="rempli" style="width:${((p.sortie || 0) / maxP) * 100}%"></span></span><span class="chiffre"${p.usd != null ? ` title="${h(usd(p.usd))}"` : ''}>${abr(p.sortie)}</span></div>`).join('') || '<div class="vide">Rien sur la période.</div>'}</div></div>
    </div>
    <div class="carte tableau section"><table class="triable"><thead><tr><th>Modèle, ${n} j</th><th class="num">Entrée</th><th class="num">Cache écrit</th><th class="num">Cache lu</th><th class="num">Sortie</th><th class="num" data-sens="desc">Coût liste</th></tr></thead><tbody>
      ${[...modeles].sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1)).map((m) => `<tr><td class="mono"><a href="#/sessions?modele=${encodeURIComponent(m.cle || '')}" title="Sessions qui ont utilisé ce modèle">${h(m.cle)}</a>${m.via ? ` <span class="badge" title="${nf.format(m.via)} relevé(s) passés par un intermédiaire (anthropic/…), au même prix liste">dont intermédiaire</span>` : ''}</td>${num(m.entree, abr(m.entree))}${num(m.cache_ecrit, abr(m.cache_ecrit))}${num(m.cache_lu, abr(m.cache_lu))}${num(m.sortie, abr(m.sortie))}${num(m.usd, m.usd == null ? '<span class="discret">sans tarif</span>' : usd(m.usd))}</tr>`).join('') || '<tr><td colspan="6" class="vide">Rien sur la période.</td></tr>'}
    </tbody></table></div>
    <div class="grille g2 section">
      <div class="carte"><h2>Appels MCP, ${n} j</h2>${p.mcp.length ? `<div class="barres">${p.mcp.map((m) => `
        <div class="barre"><a class="nom" href="#/journal?kind=tool.called&serveur=${encodeURIComponent(m.cle || '')}" title="${h(m.cle)}">${h(m.cle)}</a><span class="piste"><span class="rempli" style="width:${(m.n / maxM) * 100}%"></span></span><span class="chiffre"${m.echecs ? ` title="${nf.format(m.echecs)} refusé(s) ou en erreur sur ${nf.format(m.n)}"` : ''}>${nf.format(m.n)}${m.echecs ? ` · <span class="alerte-texte">${pct(m.echecs, m.n)}</span>` : ''}</span></div>`).join('')}</div>` : '<div class="discret">Aucun appel MCP sur la période.</div>'}${(p.degradations || []).length ? `<p class="avertissement" title="La passerelle ignore une cible qui échoue (failOpen) : le serveur disparaît des clients sans erreur.">Cibles ignorées par la passerelle : ${p.degradations.map((x) => `<a href="#/journal?kind=system.degraded&serveur=${encodeURIComponent(x.cle || '')}">${h(x.cle || '?')}</a> (${nf.format(x.n)}${x.demarrage ? `, dont ${nf.format(x.demarrage)} au démarrage` : ''})`).join(', ')}</p>` : ''}</div>
      <div class="carte"><h2>Refus d’outil, ${n} j</h2>${refus.length ? `<div class="barres">${refus.map((r) => `
        <div class="barre"><a class="nom" href="#/journal?kind=tool.denied&origine=${encodeURIComponent(r.cle || '')}">${h(ORIGINES[r.cle] || r.cle)}</a><span class="piste"><span class="rempli" style="width:${(r.n / maxR) * 100}%"></span></span><span class="chiffre">${nf.format(r.n)}</span></div>`).join('')}</div>
        <p class="discret">Outils les plus refusés : ${p.refus.par_outil.map((o) => `<a href="#/journal?kind=tool.denied&outil=${encodeURIComponent(o.cle || '')}">${h(o.cle || '?')}</a> (${nf.format(o.n)})`).join(', ')}</p>` : '<div class="discret">Aucun refus sur la période.</div>'}</div>
    </div>
    <div class="grille g2 section">
      <div class="carte"><h2>Catalogue</h2><div class="puces">${e.fiches_par_type.map((f) => `<a class="puce" href="#/catalogue?kind=${encodeURIComponent(f.kind)}"><b>${nf.format(f.n)}</b> ${h(type(f.kind))}</a>`).join('')}</div>
        ${absentes.length ? `<p class="discret" title="${h(absentes.join('\n'))}">Non vu sur ce site : ${h(absentes.map((a) => a.split(' : ')[0]).join(', '))}</p>` : ''}</div>
      <div class="carte"><h2>À regarder</h2>${e.projets_sales.length || e.memoires_doubles.length ? `<div class="barres">${e.projets_sales.map((p) => `<div><span class="badge alerte">${nf.format(p.n)} fichier(s) non commité(s)</span> <a href="#/projets">${h(p.name)}</a></div>`).join('')}${e.memoires_doubles.map((m) => `<div title="${h(m.projets || '')}"><span class="badge alerte">mémoire en ${m.n} exemplaires</span> <a href="#/catalogue?kind=memory&q=${encodeURIComponent(m.name)}">${h(m.name)}</a></div>`).join('')}</div>` : '<div class="discret">Rien à signaler.</div>'}</div>
    </div>
    <p class="discret section">Interface ouverte ${nf.format(p.ui.jours_actifs)} jour${p.ui.jours_actifs > 1 ? 's' : ''} sur ${n}${p.ui.pages.length ? ` · ${p.ui.pages.map((x) => `${h(x.cle)} ${nf.format(x.n)}`).join(', ')}` : ''}.</p>`;
}

// Texte tiré de l'arbre : les `code` restent lisibles, rien d'autre n'est interprété.
const md = (t) => h(t).replace(/`([^`]+)`/g, '<code>$1</code>');

async function projets(params) {
  const tous = params.get('tous') === '1';
  const { projets: liste, hors_projet: hors } = await api('/api/projets');
  const actifs = liste.filter((p) => !p.calme); const calmes = liste.filter((p) => p.calme);
  const tech = (p) => {
    const t = p.technique; const b = [];
    if (t.fichiers_modifies) b.push(`<span class="badge alerte" title="Fichiers modifiés ou non suivis">${nf.format(t.fichiers_modifies)} non commité${t.fichiers_modifies > 1 ? 's' : ''}</span>`);
    if (t.en_avance) b.push(`<span class="badge alerte" title="Commits absents de ${h(t.amont)}">${nf.format(t.en_avance)} non poussé${t.en_avance > 1 ? 's' : ''}</span>`);
    if (t.en_retard) b.push(`<span class="badge" title="Commits de ${h(t.amont)} absents ici, d’après le dernier fetch${t.dernier_fetch ? ` (${h(date(t.dernier_fetch))})` : ''}">${nf.format(t.en_retard)} en retard</span>`);
    if (!t.amont && p.branche && p.branche !== 'HEAD') b.push('<span class="badge" title="La branche n’a pas de branche amont : jamais poussée, ou dépôt sans remote">sans amont</span>');
    if (!b.length && t.amont) b.push(`<span class="badge ok" title="À jour avec ${h(t.amont)}, d’après le dernier fetch">à jour</span>`);
    return b.join(' ');
  };
  const cout = (u) => (u == null ? '' : ` · ${usd(u)}`);
  const carte = (p) => {
    const a = p.activite; const e = p.etape;
    return `<div class="carte projet">
      <div class="tete"><a class="t" href="#" data-fiche="${h(p.id)}" title="${h(p.chemin || '')}">${h(p.nom)}</a>${p.branche ? ` <span class="mono discret">${h(p.branche)}</span>` : ''} ${tech(p)} <a class="regles discret" href="#/regles?projet=${encodeURIComponent(p.id)}" title="Règle effective du projet : profil, contexte, types, projet">règles</a></div>
      ${e ? `<div class="etape"><a href="#" data-fiche="${h(e.id)}">${h(e.titre)}</a>${e.close ? ' <span class="badge ok">close</span>' : ''} <span class="discret">· ${nf.format(e.faits)} fait${e.faits > 1 ? 's' : ''}</span>
        ${e.dernier_fait ? `<div class="discret">Dernier fait${e.dernier_fait.date ? ` (${jj(e.dernier_fait.date)})` : ''} : ${md(e.dernier_fait.texte || '')}</div>` : ''}
        ${e.reste.length ? `<div class="reste"><b>Reste</b><ul>${e.reste.map((r) => `<li>${md(r)}</li>`).join('')}</ul></div>` : ''}</div>` : p.arbre ? '<div class="discret">Arbre sans spécification d’étape.</div>' : ''}
      ${p.questions.length || p.decisions.length ? `<div class="attend">${p.decisions.length ? `<details><summary><span class="badge accent">${nf.format(p.decisions.length)} décision${p.decisions.length > 1 ? 's' : ''} à approuver</span></summary><ul>${p.decisions.map((d) => `<li><a href="#" data-fiche="${h(d.id)}">${h(d.titre)}</a></li>`).join('')}</ul></details>` : ''}${p.questions.length ? `<details><summary><span class="badge accent">${nf.format(p.questions.length)} question${p.questions.length > 1 ? 's' : ''} ouverte${p.questions.length > 1 ? 's' : ''}</span></summary><ul>${p.questions.map((q) => `<li><b>${h(q.id)}</b> ${md(q.question || '')}${q.niveau ? ` <span class="discret">(${h(q.niveau)})</span>` : ''}</li>`).join('')}</ul></details>` : ''}</div>` : ''}
      <div class="activite discret">${a ? `<a href="#/sessions?projet=${encodeURIComponent(p.id)}" title="Sessions qui ont travaillé dans ce projet (coût d’une session partagé entre ses projets)">7 j : ${nf.format(a.sessions_7)} session${a.sessions_7 > 1 ? 's' : ''}${cout(a.usd_7)} · 30 j : ${nf.format(a.sessions_30)}${cout(a.usd_30)}</a> · dernière ${h(depuis(a.derniere_session))}` : 'Aucune session sur 30 j'}${p.dernier_commit ? ` · commit ${h(depuis(p.dernier_commit.at))}${p.dernier_commit.sujet ? ` : <span title="${h(p.dernier_commit.sujet)}">${h(p.dernier_commit.sujet.length > 70 ? `${p.dernier_commit.sujet.slice(0, 69)}…` : p.dernier_commit.sujet)}</span>` : ''}` : ''}</div>
    </div>`;
  };
  return `
    <div class="entete"><h1>Projets</h1><div class="puces" role="group" aria-label="Projets montrés"><a class="puce ${tous ? '' : 'actif'}" href="#/projets">En mouvement (${actifs.length})</a><a class="puce ${tous ? 'actif' : ''}" href="#/projets?tous=1">Tous (${liste.length})</a></div></div>
    <p class="sous-titre">Où en est chaque projet d’après son arbre, ce qui l’attend, son activité et l’état de son dépôt. Une session compte pour chaque projet où elle a travaillé.</p>
    <div class="grille g2">${(tous ? liste : actifs).map(carte).join('') || '<div class="carte vide">Aucun projet en mouvement sur 30 jours.</div>'}</div>
    ${!tous && calmes.length ? `<div class="carte tableau section"><h2>Sans activité sur 30 jours, rien en attente</h2><table class="triable"><thead><tr><th>Projet</th><th>Branche</th><th class="num" data-sens="desc">Dernier commit</th></tr></thead><tbody>${calmes.map((p) => `<tr class="cliquable" data-fiche="${h(p.id)}"><td>${h(p.nom)}</td><td class="mono desc">${h(p.branche || '')}</td><td class="num" data-v="${p.dernier_commit ? Date.parse(p.dernier_commit.at) : -1}">${p.dernier_commit ? h(date(p.dernier_commit.at)) : '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${hors ? `<p class="discret section"><a href="#/sessions?projet=aucun">Hors projet sur 30 j : ${nf.format(hors.sessions_30)} session${hors.sessions_30 > 1 ? 's' : ''}${cout(hors.usd_30)}</a> (aucun projet du catalogue touché).</p>` : ''}`;
}

async function catalogue(params) {
  const kind = params.get('kind') || ''; const q = params.get('q') || '';
  const [e, fiches, projets] = await Promise.all([api('/api/etat'), api(`/api/fiches?${new URLSearchParams({ ...(kind && { kind }), ...(q && { q }) })}`), api('/api/fiches?kind=project')]);
  const noms = new Map(projets.map((p) => [p.id, p.name]));
  const ou = (f) => (f.links?.project || []).map((id) => noms.get(id) || id).join(', ') || (f.attributes?.dossier ? `dossier ${f.attributes.dossier}` : '');
  return `
    <h1>Catalogue</h1>
    <p class="sous-titre">Tout ce qui est en place. Ce qui n’y figure pas n’existe pas pour le système.</p>
    <div class="outils">
      <input type="search" id="recherche" placeholder="Nom, description, chemin…" title="Rechercher un nom, une description ou un chemin" value="${h(q)}">
      <div class="puces"><a class="puce ${kind ? '' : 'actif'}" href="#/catalogue">Tout</a>${e.fiches_par_type.map((f) => `<a class="puce ${f.kind === kind ? 'actif' : ''}" href="#/catalogue?kind=${encodeURIComponent(f.kind)}"><b>${f.n}</b> ${h(type(f.kind))}</a>`).join('')}</div>
    </div>
    <div class="carte tableau"><table class="triable"><thead><tr><th>Nom</th><th>Type</th><th>Où</th><th>Statut</th></tr></thead><tbody>
      ${fiches.map((f) => `<tr class="cliquable" data-fiche="${h(f.id)}"><td><div>${h(f.name)}</div><div class="desc">${h(f.description || '')}</div></td><td><span class="badge">${h(type(f.kind))}</span></td><td class="mono desc">${h(ou(f))}</td><td><span class="badge ${statut(f) === 'active' || statut(f) === 'stable' ? 'ok' : statut(f) === 'proposed' || statut(f) === 'draft' ? 'accent' : ''}">${h(statut(f))}</span></td></tr>`).join('') || '<tr><td colspan="4" class="vide">Aucun élément.</td></tr>'}
    </tbody></table></div>`;
}

async function sessions(params) {
  const projet = params.get('projet') || ''; const jour = params.get('jour') || ''; const modele = params.get('modele') || '';
  const toutes = await api('/api/sessions?jours=90');
  // Projets des sessions, par identifiant (décision rattachement-projet) ; `aucun` : sessions hors projet.
  const projets = [...new Map(toutes.flatMap((s) => s.projets).map((p) => [p.id, p.nom || p.id])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const liste = toutes.filter((s) => (!projet || (projet === 'aucun' ? !s.projets.length : s.projets.some((p) => p.id === projet))) && (!jour || s.fin.slice(0, 10) === jour) && (!modele || (s.data.modeles || []).some((x) => x === modele || x === `anthropic/${modele}`)));
  return `
    <h1>Sessions</h1>
    <p class="sous-titre">Sessions Claude Code des 90 derniers jours, sous-agents rattachés à leur session. Une session appartient aux projets où elle a travaillé.</p>
    <div class="outils"><select id="projet"><option value="">Tous les projets (${toutes.length} sur 90 j)</option>${projets.map(([id, nom]) => `<option value="${h(id)}" ${id === projet ? 'selected' : ''}>${h(nom)}</option>`).join('')}<option value="aucun" ${projet === 'aucun' ? 'selected' : ''}>Hors projet</option></select>${jour ? `<a class="puce actif" href="#/sessions${projet ? `?projet=${encodeURIComponent(projet)}` : ''}" title="Retirer le filtre">${jj(jour)} ✕</a>` : ''}${modele ? `<a class="puce actif" href="#/sessions" title="Retirer le filtre">${h(modele)} ✕</a>` : ''}</div>
    <div class="carte tableau"><table class="triable"><thead><tr><th>Fin</th><th>Projet</th><th class="num">Durée</th><th class="num">Tours</th><th class="num">Sous-agents</th><th class="num">Refus</th><th class="num">Sortie</th><th class="num">Cache lu</th><th class="num">Coût</th><th class="num" title="Coût de la session (sous-agents compris) divisé par ses tours : il monte quand chaque tour relit un long contexte">Coût / tour</th><th>Modèle</th></tr></thead><tbody>
      ${liste.map((s) => `<tr class="cliquable" data-lien="#/journal?session=${encodeURIComponent(s.session)}" title="Voir les événements de la session"><td class="date" data-v="${Date.parse(s.fin)}" title="${h(date(s.fin))}">${h(dateCourte(s.fin))}</td><td title="${h(s.projets.some((p) => p.repli) ? 'Aucun projet touché par les appels d’outils : projet du dossier de départ' : 'Projets où la session a travaillé (appels d’outils)')}">${h(s.projets.map((p) => p.nom || p.id).join(', ') || '—')}${s.data.branche ? ` <span class="discret">${h(s.data.branche)}</span>` : ''}${s.data.projet && !s.projets.some((p) => p.nom === s.data.projet) ? `<div class="desc" title="Dossier de départ de la session">depuis ${h(s.data.projet)}</div>` : ''}</td>${num(s.data.duree_s, h(duree(s.data.duree_s)))}${num(s.data.tours || 0, nf.format(s.data.tours || 0))}${num(s.sous_agents || 0, s.sous_agents || '')}${num(s.refus || 0, s.refus || '')}${num(s.sortie, abr(s.sortie))}${num(s.cache_lu, abr(s.cache_lu))}${num(s.usd, usd(s.usd))}${(() => { const pt = s.usd != null && s.tours_total ? s.usd / s.tours_total : null; return `<td class="num" data-v="${pt ?? -1}"${s.tours_total ? ` title="contexte relu en moyenne : ${h(abr(Math.round((s.cache_lu || 0) / s.tours_total)))} tokens par tour"` : ''}>${pt == null ? '—' : `${pt.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`}</td>`; })()}<td class="mono desc" title="${h((s.data.modeles || []).join(', '))}">${h((s.data.modeles || []).map(court).join(', '))}</td></tr>`).join('') || '<tr><td colspan="11" class="vide">Aucune session.</td></tr>'}
    </tbody></table></div>`;
}

async function journal(params) {
  const kind = params.get('kind') || ''; const session = params.get('session') || ''; const origine = params.get('origine') || ''; const serveur = params.get('serveur') || '';
  const outil = params.get('outil') || '';
  // Sans filtre, les pages consultées (ui.viewed) restent hors du flux : nombreuses, elles noieraient le reste.
  const ev = (await api(`/api/evenements?${new URLSearchParams({ limite: 300, ...(kind ? { kind } : { sauf: 'ui' }), ...(session && { session }) })}`)).filter((e) => (!origine || e.data?.origine === origine) && (!serveur || e.data?.serveur === serveur) && (!outil || e.data?.outil === outil));
  const garder = (k) => `#/journal?${new URLSearchParams({ ...(k && { kind: k }), ...(session && { session }) })}`;
  const familles = ['session', 'cost', 'tool', 'element', 'inventory', 'ui'];
  return `
    <h1>Journal</h1>
    <p class="sous-titre">Les 300 derniers événements. Ce qui n’est pas au journal ne s’est pas passé.</p>
    <div class="outils"><div class="puces"><a class="puce ${kind ? '' : 'actif'}" href="${garder('')}">Tout</a>${familles.map((f) => `<a class="puce ${f === kind ? 'actif' : ''}" href="${garder(f)}">${f}</a>`).join('')}${session ? `<a class="puce actif" href="#/journal${kind ? `?kind=${kind}` : ''}" title="Retirer le filtre">session ${h(session.slice(0, 8))} ✕</a>` : ''}${origine ? `<a class="puce actif" href="#/journal?kind=tool.denied" title="Retirer le filtre">${h(ORIGINES[origine] || origine)} ✕</a>` : ''}${serveur ? `<a class="puce actif" href="#/journal?kind=tool.called" title="Retirer le filtre">${h(serveur)} ✕</a>` : ''}${outil ? `<a class="puce actif" href="#/journal?kind=tool.denied" title="Retirer le filtre">${h(outil)} ✕</a>` : ''}</div></div>
    <div class="carte">${ev.map((e) => `<div class="evenement"><span title="${h(e.at)}">${h(dateSec(e.at))}</span><span><span class="badge fam-${h(e.kind.split('.')[0])}${e.kind === 'tool.denied' ? ' refus' : ''}">${h(e.kind)}</span></span><span>${e.subject?.startsWith('holarch:') ? `<a href="#" data-fiche="${h(e.subject)}">${h(e.data?.projet || e.subject)}</a>` : h(e.data?.projet || e.subject || '')}${e.correlation && !session ? ` <a class="discret" href="#/journal?session=${encodeURIComponent(e.correlation.split(':')[0])}" title="Tous les événements de cette session">session</a>` : ''}${e.data?.serveur ? ` · ${h(e.data.serveur)}` : ''}${e.data?.outil ? ` · ${h(e.data.outil)}` : ''}${e.data?.statut && e.data.statut !== 'ok' ? ` · ${h(e.data.statut)}` : ''}${e.data?.origine ? ` · ${h(ORIGINES[e.data.origine] || e.data.origine)}` : ''} <span class="discret">${h(e.actor)}${e.tok_out ? ` · ${abr(e.tok_out)} tokens de sortie` : ''}${e.data?.fiches != null ? ` · ${e.data.fiches} fiches` : ''}</span></span></div>`).join('') || '<div class="vide">Journal vide.</div>'}</div>`;
}

async function arbre(params) {
  const statut = ['draft', 'stable'].includes(params.get('statut')) ? params.get('statut') : '';
  const noeuds = await api('/api/arbre');
  const parChemin = new Map(noeuds.map((n) => [n.chemin, n]));
  const enfants = new Map();
  const racines = [];
  for (const n of noeuds) {
    if (n.parent && parChemin.has(n.parent) && n.parent !== n.chemin) { if (!enfants.has(n.parent)) enfants.set(n.parent, []); enfants.get(n.parent).push(n); } else racines.push(n);
  }
  const tete = (n) => `<div class="noeud"><a class="t" href="#" data-fiche="${h(n.id)}">${h(n.titre)}</a><span class="badge">${h(n.type)}</span><span class="badge ${n.statut === 'stable' ? 'ok' : 'accent'}">${h(n.statut || '—')}</span>${n.version ? `<span class="badge">${h(n.version)}</span>` : ''}<span class="d">${h(n.description || '')}</span></div>`;
  // Avec un filtre de statut, un nœud reste affiché s'il correspond ou si l'un de ses descendants correspond (le chemin
  // jusqu'à lui reste lisible) ; ceux qui ne correspondent pas eux-mêmes sont estompés.
  const garde = (n) => !statut || n.statut === statut || (enfants.get(n.chemin) || []).some(garde);
  const rendre = (n) => {
    if (!garde(n)) return '';
    const attenue = statut && n.statut !== statut ? ' attenue' : '';
    return enfants.has(n.chemin)
      ? `<li class="${attenue}"><details open><summary>${tete(n)}</summary><ul>${enfants.get(n.chemin).map(rendre).join('')}</ul></details></li>`
      : `<li class="feuille${attenue}">${tete(n)}</li>`;
  };
  const parProjet = Map.groupBy ? Map.groupBy(racines, (n) => n.projet?.nom || n.projet?.id || null) : new Map([[null, racines]]);
  return `
    <h1>Arbre</h1>
    <p class="sous-titre">Les intentions, de la ligne directrice aux décisions. Un nœud en <span class="badge accent">draft</span> est une proposition ; seul le <span class="badge ok">stable</span> oblige.</p>
    <div class="outils"><div class="puces">${[['', 'Tout'], ['draft', 'draft'], ['stable', 'stable']].map(([v, l]) => `<a class="puce ${v === statut ? 'actif' : ''}" href="#/arbre${v ? `?statut=${v}` : ''}">${l}</a>`).join('')}</div>
      <button type="button" class="secondary outline replier" data-replier="1">Tout replier</button><button type="button" class="secondary outline replier" data-replier="0">Tout déplier</button></div>
    ${[...parProjet].map(([projet, rs]) => `<div class="carte arbre section"><h2>${h(projet || '')}</h2><ul>${rs.map(rendre).join('')}</ul></div>`).join('') || '<div class="carte vide">Aucun arbre trouvé.</div>'}`;
}

// Règle effective (étape 3, tranche 3) : d'un projet, ou ce qui vaut pour tout le compte et les projets qui ont des règles.
const ORIGINE_REGLE = { profil: 'Profil', contexte: 'Contexte', type: 'Type', projet: 'Projet' };
async function regles(params) {
  const projet = params.get('projet') || '';
  const r = await api(`/api/regles${projet ? `?projet=${encodeURIComponent(projet)}` : ''}`);
  const corps = projet ? r : r.compte;
  const lignes = corps.regles.map((e) => {
    const cc = e.claude_code;
    return `<tr><td><a href="#" data-fiche="${h(e.fiche)}">${h(e.id)}</a></td><td><span class="badge" title="${h(`${e.provenance.arbre}:${e.provenance.noeud}`)}">${h(ORIGINE_REGLE[e.origine] || e.origine)}${e.origine === 'type' ? ` ${h(e.provenance.titre)}` : ''}</span>${e.recouvre.length ? '<div class="desc">redéfinit une règle plus haute</div>' : ''}</td>
      <td title="${h(e.pourquoi || '')}">${h(e.enonce)}${e.derogee ? `<div class="desc">dérogée : ${h(e.derogee.pourquoi || '')}</div>` : ''}</td><td class="mono desc">${h(e.niveau)}</td>
      <td><span class="badge ${e.statut === 'stable' ? 'ok' : 'accent'}">${h(e.statut)}</span></td><td class="desc">${cc.non ? h(cc.non) : `<span class="mono">${h(cc.portee)} : ${h(cc.fichier)}</span>`}</td></tr>`;
  }).join('');
  const table = `<div class="carte tableau section"><table class="triable"><thead><tr><th>Règle</th><th>Origine</th><th>Énoncé</th><th>Niveau</th><th>Statut</th><th>Claude Code</th></tr></thead><tbody>${lignes || '<tr><td colspan="6" class="vide">Aucune règle.</td></tr>'}</tbody></table></div>`;
  const signaux = corps.signaux.length ? `<div class="carte section"><b>À regarder</b><ul>${corps.signaux.map((x) => `<li>${h(x)}</li>`).join('')}</ul></div>` : '';
  const rappels = `<span title="Texte des règles de niveau rappel, chargé dans le contexte de l’agent à chaque tour">${nf.format(corps.rappels)} caractères chargés à chaque tour</span>`;
  if (projet) {
    return `<h1>Règles — ${h(r.nom || projet)}</h1>
      <p class="sous-titre">Règle effective du projet : profil, contexte, types${r.arbre?.types.length ? ` (${r.arbre.types.map(h).join(', ')})` : ''}, puis le projet ; le plus spécifique l’emporte. Seul le <span class="badge ok">stable</span> s’applique. ${rappels}.</p>
      ${signaux}${table}<p class="discret section"><a href="#/regles">Ce qui vaut pour tout le compte</a></p>`;
  }
  return `<h1>Règles</h1>
    <p class="sous-titre">Ce qui vaut pour tous les projets de ce site (profil et contexte, écrits au niveau du compte) ; ${rappels}. Un projet ajoute ses types et ses propres règles.</p>
    ${signaux}${table}
    <div class="carte tableau section"><h2>Projets qui ont des règles</h2><table class="triable"><thead><tr><th>Projet</th><th>Contexte</th><th>Types</th><th class="num">Appliquées</th><th class="num">Proposées</th><th class="num">Rappels</th></tr></thead><tbody>
      ${r.projets.map((p) => `<tr class="cliquable" data-lien="#/regles?projet=${encodeURIComponent(p.id)}"><td>${h(p.nom)}${p.signaux ? ` <span class="badge alerte" title="Signaux à regarder">${p.signaux}</span>` : ''}</td><td class="desc">${p.declare ? 'déclaré' : 'aucun'}</td><td class="mono desc">${h(p.types.join(', '))}</td>${num(p.appliquees, nf.format(p.appliquees))}${num(p.proposees, nf.format(p.proposees))}${num(p.rappels, nf.format(p.rappels))}</tr>`).join('') || '<tr><td colspan="6" class="vide">Aucun projet n’a de règles.</td></tr>'}
    </tbody></table></div>`;
}

async function ouvrirFiche(id) {
  const t = $('#tiroir');
  t.hidden = false; t.innerHTML = '<p class="chargement">Chargement…</p>';
  const r = await api(`/api/fiche?id=${encodeURIComponent(id)}`);
  if (!r) { t.innerHTML = '<p>Introuvable.</p>'; return; }
  const f = r.fiche;
  const champs = [['Type', type(f.kind)], ['Statut', f.status], ['Statut dans l’arbre', f.kind === 'node' ? f.attributes?.statut : null], ['Description', f.description], ['Emplacement', f.location], ['Site', f.site], ['Nœud', f.node], ['Version', f.version], ['Classification', f.classification], ['Provenance', f.provenance?.source], ['Dernier usage', f.usage?.last_used ? date(f.usage.last_used) : null]].filter(([, v]) => v);
  t.innerHTML = `<button class="fermer secondary outline" type="button" id="fermer">Fermer</button><h2>${h(f.name)}</h2><div class="mono discret">${h(f.id)}</div>
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
const VUES = { '': ['tableau', tableau], projets: ['projets', projets], regles: ['regles', regles], catalogue: ['catalogue', catalogue], sessions: ['sessions', sessions], journal: ['journal', journal], arbre: ['arbre', arbre] };
let NAVIGATION = 0;
async function router() {
  const jeton = ++NAVIGATION;
  const [chemin, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const [nom, vue] = VUES[chemin] || VUES[''];
  document.querySelectorAll('.nav nav a').forEach((a) => { const actif = a.dataset.vue === nom; a.classList.toggle('actif', actif); if (actif) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  // La dernière version de la vue s'affiche tout de suite, puis se remplace par les données fraîches.
  $('#vue').innerHTML = DERNIERES[location.hash] || '<p class="chargement">Chargement…</p>';
  // La page consultée va au journal avant que la vue ne lise l'état : elle s'y compte déjà. Un échec ne gêne pas la lecture.
  const jours = new URLSearchParams(qs || '').get('jours');
  await api(`/api/vue?${new URLSearchParams({ page: nom, ...(nom === 'tableau' && { jours: jours || 30 }) })}`, { method: 'POST' }).catch(() => {});
  try {
    const cle = location.hash; const html = await vue(new URLSearchParams(qs || ''));
    if (jeton !== NAVIGATION) return; // une navigation plus récente a pris la main
    DERNIERES[cle] = html; $('#vue').innerHTML = html;
  } catch (e) { if (jeton !== NAVIGATION) return; $('#vue').innerHTML = `<div class="carte"><b>Erreur</b> : ${h(e.message)}</div>`; }
  triables();
  const rech = $('#recherche');
  if (rech) rech.onchange = () => { const p = new URLSearchParams(qs || ''); rech.value ? p.set('q', rech.value) : p.delete('q'); location.hash = `#/catalogue?${p}`; };
  const pr = $('#projet');
  if (pr) pr.onchange = () => { location.hash = pr.value ? `#/sessions?projet=${encodeURIComponent(pr.value)}` : '#/sessions'; };
}
document.addEventListener('click', (ev) => {
  const f = ev.target.closest('[data-fiche]');
  if (f) { ev.preventDefault(); ouvrirFiche(f.dataset.fiche); return; }
  const r = ev.target.closest('[data-replier]');
  if (r) { document.querySelectorAll('.arbre details').forEach((d) => { d.open = r.dataset.replier !== '1'; }); return; }
  const l = ev.target.closest('[data-lien]');
  if (l && !ev.target.closest('a')) location.hash = l.dataset.lien;
});
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') $('#tiroir').hidden = true; });
$('#rafraichir').onclick = async (ev) => {
  const b = ev.currentTarget; b.disabled = true; b.textContent = 'Rafraîchissement…';
  try { await api('/api/rafraichir', { method: 'POST' }); await router(); } finally { b.disabled = false; b.textContent = 'Rafraîchir'; }
};
api('/api/etat').then((e) => { $('#site').textContent = `site ${e.site}`; }).catch(() => {});
window.addEventListener('hashchange', router);
router();
