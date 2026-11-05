import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {sla, summarize, urgencyQueue, nextStep, periodStart, countBy, STATUS_ORDER, agentRanking, canTransition, ticketsUrl} from '../src/lib/dashboard.ts';

const root=resolve(import.meta.dirname,'..');
const H=3_600_000;
const NOW=Date.parse('2026-11-03T12:00:00Z');
const iso=(ms)=>new Date(ms).toISOString();
const ticket=(o={})=>({id:'x',folio:'UDL-X',subject:'Prueba',status:'abierto',priority:'media',campus:'Centro',category:'Red',
  created_at:iso(NOW-10*H),updated_at:null,resolution_due_at:iso(NOW+38*H),resolved_at:null,assignee_id:null,requester_id:'r',...o});

test('SLA distingue en tiempo, por vencer y vencido con horas corridas',()=>{
  assert.equal(sla(ticket(),NOW).state,'ok');
  assert.equal(sla(ticket({created_at:iso(NOW-40*H),resolution_due_at:iso(NOW+8*H)}),NOW).state,'riesgo');
  assert.equal(sla(ticket({created_at:iso(NOW-50*H),resolution_due_at:iso(NOW-2*H)}),NOW).state,'vencido');
});

test('SLA de tickets resueltos se evalúa contra la fecha de resolución',()=>{
  assert.equal(sla(ticket({status:'resuelto',resolved_at:iso(NOW-H)}),NOW).state,'cumplido');
  assert.equal(sla(ticket({status:'cerrado',resolution_due_at:iso(NOW-5*H),resolved_at:iso(NOW-H)}),NOW).state,'incumplido');
});

test('el resumen no inventa porcentaje SLA sin tickets cerrados',()=>{
  const s=summarize([ticket(),ticket({assignee_id:'a'})],NOW);
  assert.equal(s.slaPct,null);
  assert.equal(s.avgResolutionMs,null);
  assert.equal(s.open,2);
  assert.equal(s.unassigned,1);
});

test('el resumen calcula cumplimiento y tiempo promedio con datos reales',()=>{
  const rows=[
    ticket({status:'resuelto',created_at:iso(NOW-10*H),resolved_at:iso(NOW-6*H)}),
    ticket({status:'cerrado',created_at:iso(NOW-60*H),resolution_due_at:iso(NOW-12*H),resolved_at:iso(NOW-4*H)}),
    ticket({created_at:iso(NOW-50*H),resolution_due_at:iso(NOW-2*H)}),
  ];
  const s=summarize(rows,NOW);
  assert.equal(s.slaPct,50);
  assert.equal(s.overdue,1);
  assert.equal(s.avgResolutionMs,30*H);
});

test('la cola prioriza vencidos, luego por vencer y luego prioridad',()=>{
  const q=urgencyQueue([
    ticket({id:'baja-ok',priority:'baja'}),
    ticket({id:'urgente-ok',priority:'urgente'}),
    ticket({id:'vencido',created_at:iso(NOW-50*H),resolution_due_at:iso(NOW-H)}),
    ticket({id:'riesgo',created_at:iso(NOW-40*H),resolution_due_at:iso(NOW+4*H)}),
    ticket({id:'cerrado',status:'cerrado'}),
  ],NOW).map((t)=>t.id);
  assert.deepEqual(q,['vencido','riesgo','urgente-ok','baja-ok']);
});

test('el solicitante ve quién tiene la acción pendiente',()=>{
  assert.equal(nextStep('en_espera').who,'tu');
  assert.equal(nextStep('nuevo').who,'soporte');
  assert.equal(nextStep('cerrado').who,'nadie');
});

test('periodo por defecto es 30 días y "todo" no filtra',()=>{
  assert.equal(periodStart(undefined,NOW).since,iso(NOW-30*86_400_000));
  assert.equal(periodStart('todo',NOW).since,null);
});

test('countBy incluye categorías vacías para gráficas comparables',()=>{
  const c=countBy([ticket({status:'nuevo'})],(t)=>t.status,STATUS_ORDER);
  assert.equal(c.length,6);
  assert.equal(c.find((d)=>d.key==='nuevo').value,1);
});

test('el panel respeta movimiento reducido y no usa datos de ejemplo',async()=>{
  const css=await readFile(resolve(root,'src/app/globals.css'),'utf8');
  assert.match(css,/prefers-reduced-motion: reduce/);
  const page=await readFile(resolve(root,'src/app/(app)/page.tsx'),'utf8');
  assert.match(page,/from\('tickets'\)/);
  assert.doesNotMatch(page,/Math\.random|mock|ejemplo/i);
});

test('el directivo con plantel queda acotado a ese plantel en el panel',async()=>{
  const page=await readFile(resolve(root,'src/app/(app)/page.tsx'),'utf8');
  assert.match(page,/role === 'directivo' && p\.campus/);
});

test('el ranking ordena por satisfacción, SLA y volumen',()=>{
  const agents=[{id:'a',full_name:'Ana'},{id:'b',full_name:'Beto'},{id:'c',full_name:'Caro'}];
  const rows=[
    ticket({id:'1',assignee_id:'a',status:'cerrado',resolved_at:iso(NOW-9*H)}),
    ticket({id:'2',assignee_id:'a',status:'cerrado',resolved_at:iso(NOW-9*H)}),
    ticket({id:'3',assignee_id:'b',status:'cerrado',created_at:iso(NOW-60*H),resolution_due_at:iso(NOW-12*H),resolved_at:iso(NOW-H)}),
    ticket({id:'4',assignee_id:'b'}),
  ];
  const r=agentRanking(rows,[{ticket_id:'1',score:5},{ticket_id:'2',score:4},{ticket_id:'3',score:2}],agents,NOW);
  assert.deepEqual(r.map((x)=>x.id),['a','b','c']);
  assert.equal(r[0].avgScore,4.5);
  assert.equal(r[0].slaPct,100);
  assert.equal(r[1].slaPct,0);
  assert.equal(r[1].open,1);
  assert.equal(r[2].points,0);
  assert.equal(r[2].avgScore,null);
});

test('las transiciones de estado son guiadas',()=>{
  assert.ok(canTransition('nuevo','abierto'));
  assert.ok(canTransition('resuelto','abierto'));
  assert.ok(canTransition('en_espera','en_espera'));
  assert.ok(!canTransition('cerrado','resuelto'));
  assert.ok(!canTransition('nuevo','resuelto'));
});

test('las tarjetas del panel enlazan a la lista con filtros',()=>{
  assert.equal(ticketsUrl({}),'/tickets');
  assert.equal(ticketsUrl({campus:'Roma',sla:'vencido',estado:undefined}),'/tickets?campus=Roma&sla=vencido');
  assert.equal(ticketsUrl({estado:'resuelto,cerrado',campus:'todos'}),'/tickets?estado=resuelto%2Ccerrado');
});

test('la migración de evaluaciones restringe quién califica y cuándo',async()=>{
  const sql=await readFile(resolve(root,'supabase/migrations/202611030001_perfil_agente_y_encuestas.sql'),'utf8');
  assert.match(sql,/add column if not exists job_title/);
  assert.match(sql,/add column if not exists avatar_url/);
  assert.match(sql,/t\.status in \('resuelto', 'cerrado'\)/);
  assert.match(sql,/score between 1 and 5/);
  assert.match(sql,/event_staff_insert/);
});

test('la asignación usa lista de agentes y solo la ve dirección',async()=>{
  const form=await readFile(resolve(root,'src/components/TicketForms.tsx'),'utf8');
  const page=await readFile(resolve(root,'src/app/(app)/tickets/[id]/page.tsx'),'utf8');
  const actions=await readFile(resolve(root,'src/app/(app)/tickets/[id]/actions.ts'),'utf8');
  assert.match(form,/\{canAssign && \(/);
  assert.match(form,/<select name="assignee_id"/);
  assert.match(page,/canAssign=\{supervisor\}/);
  assert.doesNotMatch(page,/<input name="assignee_id"/);
  // El agente no puede cambiar la asignación aunque envíe el campo: solo se lee si es supervisor.
  assert.match(actions,/if \(supervisor\) \{\s*const raw = String\(f\.get\('assignee_id'\)/);
  assert.match(actions,/canTransition/);
});

test('tomar un ticket lo asigna al agente y lo pasa a En proceso',async()=>{
  const actions=await readFile(resolve(root,'src/app/(app)/tickets/[id]/actions.ts'),'utf8');
  const dash=await readFile(resolve(root,'src/app/(app)/page.tsx'),'utf8');
  assert.match(actions,/export async function takeTicket[\s\S]*?access\(\['agente'\]\)[\s\S]*?status: 'en_progreso'[\s\S]*?\.is\('assignee_id', null\)/);
  assert.match(dash,/access\(\['agente'\]\)[\s\S]*?const status = 'en_progreso'/);
  const {STATUS_LABEL}=await import('../src/lib/dashboard.ts');
  assert.equal(STATUS_LABEL.en_progreso,'En proceso');
});

test('resolver o cerrar exige describir la solución',async()=>{
  const actions=await readFile(resolve(root,'src/app/(app)/tickets/[id]/actions.ts'),'utf8');
  assert.match(actions,/if \(closing && resolution\.length < 10\) back/);
  assert.match(actions,/resolution_notes = resolution/);
  assert.match(actions,/Solución aplicada: \$\{resolution\}/);
});

test('el solicitante escala urgente sin agente a los 15 min y luego por intervalo',async()=>{
  const {requesterEscalation,ESCALATION_INTERVAL_MIN}=await import('../src/lib/escalation.ts');
  const M=60_000;
  const urgent={status:'nuevo',priority:'urgente',created_at:iso(NOW-10*M),assignee_id:null};
  assert.equal(requesterEscalation(urgent,null,NOW).allowed,false);
  assert.equal(requesterEscalation({...urgent,created_at:iso(NOW-15*M)},null,NOW).allowed,true);
  // Urgente ya con agente: espera el intervalo de prioridad (1 h), no 15 min.
  assert.equal(requesterEscalation({...urgent,created_at:iso(NOW-20*M),assignee_id:'a'},null,NOW).allowed,false);
  // Después de escalar, la siguiente vez cuenta desde la última escalación.
  assert.equal(requesterEscalation({...urgent,created_at:iso(NOW-5*H)},iso(NOW-30*M),NOW).allowed,false);
  assert.equal(requesterEscalation({...urgent,created_at:iso(NOW-5*H)},iso(NOW-61*M),NOW).allowed,true);
  // Las demás prioridades esperan más.
  assert.equal(ESCALATION_INTERVAL_MIN.alta,120);
  assert.equal(requesterEscalation({status:'abierto',priority:'media',created_at:iso(NOW-3*H),assignee_id:'a'},null,NOW).allowed,false);
  assert.equal(requesterEscalation({status:'abierto',priority:'media',created_at:iso(NOW-4*H),assignee_id:'a'},null,NOW).allowed,true);
  // Cerrado: nunca.
  assert.equal(requesterEscalation({...urgent,status:'cerrado',created_at:iso(NOW-9*H)},null,NOW).allowed,false);
});

test('la migración restringe la asignación y crea planteles y escalaciones',async()=>{
  const sql=await readFile(resolve(root,'supabase/migrations/202611050001_planteles_escalaciones_asignacion.sql'),'utf8');
  // El agente solo puede dejar tickets asignados a sí mismo.
  assert.match(sql,/tickets_update_agent[\s\S]*with check \(public\.current_role\(\) = 'agente' and public\.is_staff\(\) and assignee_id = auth\.uid\(\)\)/);
  assert.match(sql,/tickets_update_supervisor[\s\S]*'directivo', 'administrador'/);
  assert.match(sql,/references public\.campuses\(name\) on update cascade on delete restrict/);
  assert.match(sql,/create table if not exists public\.ticket_escalations/);
  assert.match(sql,/escalations_attend[\s\S]*'directivo', 'administrador'/);
  for(const c of ['Centro','Roma','San Ángel','Coapa','Insurgentes','Reforma','Satélite','Zaragoza'])assert.ok(sql.includes(`('${c}')`),c);
});

test('fetchAll pagina de 1,000 en 1,000 hasta agotar o llegar al máximo',async()=>{
  const {fetchAll}=await import('../src/lib/fetchAll.ts');
  const source=Array.from({length:2500},(_,i)=>i);
  const calls=[];
  const page=(a,b)=>{calls.push([a,b]);return Promise.resolve({data:source.slice(a,b+1),error:null});};
  const all=await fetchAll(page);
  assert.equal(all.data.length,2500);
  assert.deepEqual(calls,[[0,999],[1000,1999],[2000,2999]]);
  assert.equal(all.truncated,false);
  const capped=await fetchAll(page,1500);
  assert.equal(capped.data.length,1500);
  assert.equal(capped.truncated,true);
});

test('las plantillas de correo escapan HTML y enlazan al ticket o a la bandeja',async()=>{
  const {renderMail}=await import('../src/lib/mailTemplates.ts');
  const ticket={id:'abc',folio:'UDL-1',subject:'<script>x</script>',campus:'Roma',priority:'urgente',status:'resuelto'};
  const m=renderMail({event:'ticket_resuelto',ticket,recipientName:'Ana Ruiz',actorName:'Diego',message:'Se cambió el "toner" & listo',appUrl:'https://app.test'});
  assert.match(m.subject,/\[UDL-1\] Tu solicitud fue resuelta/);
  assert.doesNotMatch(m.html,/<script>/);
  assert.match(m.html,/&lt;script&gt;/);
  assert.match(m.html,/&quot;toner&quot; &amp; listo/);
  assert.match(m.html,/href="https:\/\/app\.test\/tickets\/abc"/);
  assert.match(m.text,/Calificar la atención: https:\/\/app\.test\/tickets\/abc/);
  const e=renderMail({event:'escalacion',ticket,recipientName:'Dir',actorName:'Ana',appUrl:'https://app.test'});
  assert.match(e.html,/href="https:\/\/app\.test\/escalaciones"/);
});

test('las notificaciones excluyen a quien actúa, cuentas inactivas y notas internas',async()=>{
  const n=await readFile(resolve(root,'src/lib/notify.ts'),'utf8');
  const a=await readFile(resolve(root,'src/app/(app)/tickets/[id]/actions.ts'),'utf8');
  // Destinatarios: nunca quien actúa, sin duplicados, solo cuentas activas; el correo además respeta la preferencia.
  assert.match(n,/to\.id === opts\.actorId \|\| seen\.has\(to\.id\) \|\| to\.active === false/);
  assert.match(n,/if \(!mail \|\| to\.notify_email === false \|\| !to\.email\) continue;/);
  assert.match(n,/from\('notifications'\)\.insert/);
  assert.match(n,/if \(!smtpConfigured\(\)\) \{\s*error = 'SMTP no configurado';/);
  assert.match(a,/if \(!internal\) after\(\(\) => notifyTicket\('comentario'/);
});

test('el SLA se calcula en la base según la prioridad',async()=>{
  const sql=await readFile(resolve(root,'supabase/migrations/202611060001_sla_prioridad_notificaciones.sql'),'utf8');
  assert.match(sql,/"urgente":\{"first":1,"resolve":4\}/);
  assert.match(sql,/before insert or update of priority on public\.tickets/);
  assert.match(sql,/create table if not exists public\.notification_log/);
});

test('no quedan rutas ni scripts de demostración con credenciales',async()=>{
  const {access:exists}=await import('node:fs/promises');
  for(const p of ['src/app/api/dev/seed/route.ts','supabase/dev/acceso_demo.sql','supabase/dev/demo_personas.sql']){
    await assert.rejects(exists(resolve(root,p)),p);
  }
});

test('las escalaciones tienen seguimiento y no se cierran con la primera respuesta',async()=>{
  const sql=await readFile(resolve(root,'supabase/migrations/202611070001_seguimiento_escalaciones_y_espera.sql'),'utf8');
  const inbox=await readFile(resolve(root,'src/app/(app)/escalaciones/page.tsx'),'utf8');
  assert.match(sql,/check \(status in \('pendiente', 'en_seguimiento', 'cerrada'\)\)/);
  assert.match(sql,/create table if not exists public\.escalation_updates/);
  // Se cierran solas al resolver el ticket, dejando registro.
  assert.match(sql,/after update of status on public\.tickets[\s\S]*close_escalations_on_resolve/);
  assert.match(inbox,/status: closing \? 'cerrada' : 'en_seguimiento'/);
  assert.match(inbox,/name="intent" value="seguimiento"/);
  assert.match(inbox,/name="intent" value="cerrar"/);
  const {isOpenEscalation}=await import('../src/lib/escalationView.ts');
  assert.ok(isOpenEscalation('pendiente')&&isOpenEscalation('en_seguimiento')&&!isOpenEscalation('cerrada'));
});

test('"En espera" deja claro que soporte espera al solicitante',async()=>{
  const {STATUS_LABEL,REQUESTER_STATUS_LABEL,nextStep}=await import('../src/lib/dashboard.ts');
  assert.equal(STATUS_LABEL.en_espera,'Esperando al solicitante');
  assert.equal(REQUESTER_STATUS_LABEL.en_espera,'Requiere tu respuesta');
  assert.equal(nextStep('en_espera').who,'tu');
  const actions=await readFile(resolve(root,'src/app/(app)/tickets/[id]/actions.ts'),'utf8');
  assert.match(actions,/if \(asking && question\.length < 10\) back/);
  assert.match(actions,/Necesitamos tu respuesta: \$\{question\}/);
  // La pregunta se guarda antes del cambio de estado para que el trigger no la tome como respuesta.
  assert.ok(actions.indexOf('Necesitamos tu respuesta') < actions.indexOf("await s.from('tickets').update(patch)"));
  const sql=await readFile(resolve(root,'supabase/migrations/202611070001_seguimiento_escalaciones_y_espera.sql'),'utf8');
  // Cuando el solicitante responde, el ticket vuelve a atención.
  assert.match(sql,/t\.status = 'en_espera' and t\.requester_id = new\.author_id/);
  const layout=await readFile(resolve(root,'src/app/(app)/layout.tsx'),'utf8');
  assert.match(layout,/Soporte espera mi respuesta/);
});

test('cerrar sesión regresa al dominio desde el que se pidió',async()=>{
  const r=await readFile(resolve(root,'src/app/auth/signout/route.ts'),'utf8');
  assert.match(r,/new URL\('\/login', req\.nextUrl\.origin\)/);
  assert.doesNotMatch(r,/localhost/);
});

test('los avisos en la app son por usuario y en tiempo real',async()=>{
  const sql=await readFile(resolve(root,'supabase/migrations/202611080001_notificaciones_en_app.sql'),'utf8');
  assert.match(sql,/using \(user_id = auth\.uid\(\)\)/);
  assert.match(sql,/grant update \(read_at\) on table public\.notifications to authenticated/);
  assert.match(sql,/alter publication supabase_realtime add table public\.notifications/);
  const {inAppText}=await import('../src/lib/mailTemplates.ts');
  const t={id:'1',folio:'UDL-9',subject:'Sin red',campus:'Roma',priority:'alta',status:'en_espera'};
  assert.equal(inAppText({event:'estado',ticket:t,actorName:'Ana'}).title,'UDL-9 · Soporte necesita tu respuesta');
  assert.equal(inAppText({event:'comentario',ticket:t,actorName:'Ana',message:'x'.repeat(200)}).body.length,138);
  const sb=await readFile(resolve(root,'src/components/Sidebar.tsx'),'utf8');
  // Una sola campana montada (una suscripción): en la barra móvil o en el menú, nunca en ambos.
  assert.match(sb,/\{mobile && bell\}/);
  assert.match(sb,/\{!mobile && <span className="side-bell">\{bell\}<\/span>\}/);
});

test('eliminar cuentas exige confirmación y no borra historial',async()=>{
  const a=await readFile(resolve(root,'src/app/(app)/admin/usuarios/actions.ts'),'utf8');
  assert.match(a,/if \(id\.data === user\.id\) back\('error', 'No puedes eliminar tu propia cuenta'\)/);
  assert.match(a,/String\(f\.get\('confirm'\) \?\? ''\)\.trim\(\)\.toLowerCase\(\) !== target!\.email\.toLowerCase\(\)/);
  assert.match(a,/if \(used\.length\) back\('error'/);
  assert.match(a,/auth\.admin\.updateUserById\(id\.data!, \{ email: email\.data!, email_confirm: true \}\)/);
});

test('solo el administrador administra planteles',async()=>{
  const page=await readFile(resolve(root,'src/app/(app)/admin/planteles/page.tsx'),'utf8');
  const n=(page.match(/access\(\['administrador'\]\)/g)??[]).length;
  assert.equal(n,4,'página y sus 3 acciones');
  assert.match(page,/no puede eliminarse; desactívalo/);
});

test('los datos demo son identificables para limpiarlos',async()=>{
  const clean=await readFile(resolve(root,'supabase/dev/limpiar_tickets_demo.sql'),'utf8');
  assert.match(clean,/delete from public\.ticket_escalations where ticket_id/);
  assert.match(clean,/delete from auth\.users where email like '%@demo\.udl\.test'/);
  assert.match(clean,/delete from public\.tickets where description like '\[DEMO-SEED\]%'/);
});

test('la tendencia mensual cuenta creados y resueltos por mes',async()=>{
  const {monthlyTrend}=await import('../src/lib/dashboard.ts');
  const now=Date.parse('2026-11-15T12:00:00Z');
  const tr=monthlyTrend([
    ticket({created_at:'2026-11-02T10:00:00Z'}),
    ticket({created_at:'2026-10-20T10:00:00Z',status:'cerrado',resolved_at:'2026-11-01T10:00:00Z'}),
    ticket({created_at:'2025-01-01T10:00:00Z'}),
  ],6,now);
  assert.equal(tr.length,6);
  assert.equal(tr.at(-1).created,1);
  assert.equal(tr.at(-1).resolved,1);
  assert.equal(tr.at(-2).created,1);
  assert.equal(tr.reduce((a,m)=>a+m.created,0),2);
});

test('las fechas del Excel se muestran en hora de la Ciudad de México',async()=>{
  const {excelDate}=await import('../src/lib/xlsx.ts');
  // 18:00 UTC = 12:00 en CDMX (UTC-6, sin horario de verano desde 2022)
  assert.equal(excelDate('2026-11-03T18:00:00Z').toISOString(),'2026-11-03T12:00:00.000Z');
  assert.equal(excelDate(null),null);
});

test('el Excel tiene portada con filtros, tabla filtrable, encabezado fijo y fechas reales',async()=>{
  const {newWorkbook,addSummarySheet,addDataSheet}=await import('../src/lib/xlsx.ts');
  const {default:ExcelJS}=await import('exceljs');
  const wb=newWorkbook();
  addSummarySheet(wb,{title:'Reporte',filters:[['Periodo','30 días']],kpis:[['Tickets',3]],sections:[{title:'Por estado',head:['Estado','Tickets'],rows:[['Abierto',2]]}]});
  addDataSheet(wb,{name:'Tickets',title:'Detalle',cols:[{header:'Folio',key:'folio',width:12},{header:'Creado',key:'created',width:18,type:'date'},{header:'Calificación',key:'score',width:12,type:'stars'}],
    rows:[{folio:'UDL-1',created:'2026-11-03T18:00:00Z',score:4}],highlight:[{key:'folio',color:()=>'FFDC2626'}]});
  const back=new ExcelJS.Workbook();
  await back.xlsx.load(await wb.xlsx.writeBuffer());
  assert.deepEqual(back.worksheets.map((w)=>w.name),['Resumen','Tickets']);
  const res=back.getWorksheet('Resumen');
  const text=[];res.eachRow((r)=>r.eachCell((c)=>text.push(String(c.value))));
  assert.ok(text.includes('FILTROS APLICADOS'));
  assert.ok(text.includes('30 días'));
  const ws=back.getWorksheet('Tickets');
  assert.equal(ws.views[0].state,'frozen');
  assert.equal(ws.views[0].ySplit,4);
  assert.ok(Object.keys(ws.tables??{}).length===1||ws.getTables?.().length===1,'debe existir una tabla de Excel con filtros');
  assert.equal(ws.getCell('A4').value,'Folio');
  assert.ok(ws.getCell('B5').value instanceof Date);
  assert.equal(ws.getColumn(2).numFmt,'dd/mm/yyyy hh:mm');
  assert.equal(ws.getCell('C5').value,'★★★★☆');
  assert.equal(ws.getCell('A5').font.color.argb,'FFDC2626');
});

test('las opiniones son solo para directivo y administración',async()=>{
  const page=await readFile(resolve(root,'src/app/(app)/opiniones/page.tsx'),'utf8');
  const route=await readFile(resolve(root,'src/app/(app)/opiniones/exportar/route.ts'),'utf8');
  const lib=await readFile(resolve(root,'src/lib/opinions.ts'),'utf8');
  assert.match(page,/access\(\['directivo', 'administrador'\]\)/);
  assert.match(route,/access\(\['directivo', 'administrador'\]\)/);
  // El directivo no recibe nombres de solicitantes y queda limitado a su plantel.
  assert.match(lib,/if \(p\.role === 'administrador'\)/);
  assert.match(lib,/ctx\.role === 'directivo' && ctx\.campus/);
});

test('el filtro de estrellas acepta un nivel o las calificaciones bajas',async()=>{
  const {matchesStars}=await import('../src/lib/dashboard.ts');
  assert.ok(matchesStars(5,'5'));
  assert.ok(!matchesStars(4,'5'));
  assert.ok(matchesStars(2,'bajas'));
  assert.ok(!matchesStars(3,'bajas'));
  assert.ok(matchesStars(3,undefined));
});

test('la administración de usuarios protege al propio administrador y audita',async()=>{
  const a=await readFile(resolve(root,'src/app/(app)/admin/usuarios/actions.ts'),'utf8');
  assert.match(a,/d\.id === user\.id && \(d\.role !== 'administrador' \|\| !active\)/);
  assert.match(a,/access\(\['administrador'\]\)/);
  assert.match(a,/usuario_creado/);
  assert.match(a,/usuario_actualizado/);
});

test('la clave de servicio solo se usa en el servidor',async()=>{
  const {readdir}=await import('node:fs/promises');
  const files=(await readdir(resolve(root,'src'),{recursive:true})).filter((f)=>/\.tsx?$/.test(f));
  for(const f of files){
    const src=await readFile(resolve(root,'src',f),'utf8');
    if(/^\s*['"]use client['"]/.test(src)) assert.doesNotMatch(src,/SUPABASE_SERVICE_ROLE_KEY|supabase\/admin/,f);
  }
});

test('los usuarios desactivados no pueden entrar',async()=>{
  const auth=await readFile(resolve(root,'src/lib/auth.ts'),'utf8');
  const check=await readFile(resolve(root,'src/app/auth/session-check/route.ts'),'utf8');
  const sql=await readFile(resolve(root,'supabase/migrations/202611040001_usuarios_activos.sql'),'utf8');
  assert.match(auth,/p\.active === false/);
  assert.match(check,/profile\.active === false/);
  assert.match(sql,/and active from public\.profiles/);
});

test('el tiempo de solución se mide desde la asignación hasta la resolución',()=>{
  const rows=[
    ticket({status:'resuelto',created_at:iso(NOW-10*H),assigned_at:iso(NOW-6*H),resolved_at:iso(NOW-2*H)}),
    ticket({status:'cerrado',created_at:iso(NOW-10*H),assigned_at:iso(NOW-8*H),resolved_at:iso(NOW-6*H)}),
    ticket({status:'resuelto',created_at:iso(NOW-5*H),resolved_at:iso(NOW-H)}), // sin asignación registrada: no cuenta
  ];
  const s=summarize(rows,NOW);
  assert.equal(s.avgSolveMs,3*H);
  assert.equal(s.solvedCount,2);
  assert.equal(summarize([ticket()],NOW).avgSolveMs,null);
});

test('el solicitante elige una falla común y no la categoría; el detalle es obligatorio',async()=>{
  const page=await readFile(resolve(root,'src/app/(app)/tickets/nuevo/page.tsx'),'utf8');
  const fields=await readFile(resolve(root,'src/components/NewTicketFields.tsx'),'utf8');
  const lib=await readFile(resolve(root,'src/lib/dashboard.ts'),'utf8');
  for(const f of ['Transmisión de laptop a pantalla','Micrófono Hyflex','Problemas con Sure','Problemas con mi impresora']) assert.match(lib,new RegExp(f));
  assert.match(fields,/OTHER_ISSUE/); assert.match(fields,/subject_other/);
  assert.doesNotMatch(page,/name="category"/);
  assert.match(page,/category: UNCLASSIFIED/);
  assert.match(page,/description" minLength=\{10\} required/);
  assert.match(page,/Indica el salón o área/);
});

test('resolver exige que el ticket esté clasificado',async()=>{
  const src=await readFile(resolve(root,'src/app/(app)/tickets/[id]/actions.ts'),'utf8');
  assert.match(src,/closing && cur!\.category === UNCLASSIFIED/);
  assert.match(src,/export async function classifyTicket/);
});

test('la migración de planteles reales desactiva los anteriores sin borrarlos',async()=>{
  const sql=await readFile(resolve(root,'supabase/migrations/202611090001_planteles_reales_area_fotos.sql'),'utf8');
  for(const c of ['Vertiz','Orizaba','Frontera','Luis Cabrera','Querétaro','San Luis Potosí','Insurgentes','Medellín','Home Office']) assert.match(sql,new RegExp(`'${c}'`));
  assert.doesNotMatch(sql,/delete from public\.campuses/i);
  assert.match(sql,/set active = false/);
  assert.match(sql,/assigned_at/);
});

test('las fotos se suben por el servidor y el tema se aplica antes de pintar',async()=>{
  const actions=await readFile(resolve(root,'src/app/(app)/admin/usuarios/actions.ts'),'utf8');
  const picker=await readFile(resolve(root,'src/components/AvatarPicker.tsx'),'utf8');
  const layout=await readFile(resolve(root,'src/app/layout.tsx'),'utf8');
  assert.match(actions,/storage\.from\('avatars'\)\.upload/);
  assert.doesNotMatch(picker,/SERVICE_ROLE/);
  assert.match(picker,/Examinar/);
  assert.match(layout,/udl-theme/);
});

test('desactivar una cuenta (casilla sin marcar) no falla la validación',async()=>{
  const actions=await readFile(resolve(root,'src/app/(app)/admin/usuarios/actions.ts'),'utf8');
  const {z}=await import('zod');
  // read() convierte una casilla sin marcar en '': el esquema debe aceptarla y tratarla como "no".
  assert.doesNotMatch(actions,/active:\s*z\.enum\(\['on'\]\)/);
  assert.doesNotMatch(actions,/notify_email:\s*z\.enum\(\['on'\]\)/);
  assert.match(actions,/const active = d\.active === 'on'/);
  assert.equal(z.object({active:z.string().optional()}).safeParse({active:''}).success,true);
});
