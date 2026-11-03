// Etiquetas y tipos compartidos de escalaciones (bandeja de dirección y detalle del ticket).
export type EscStatus = 'pendiente' | 'en_seguimiento' | 'cerrada';
export type EscUpdate = { id: string; escalation_id: string; author_id: string | null; kind: 'seguimiento' | 'reasignacion' | 'prioridad' | 'cierre'; note: string; created_at: string };

export const ESC_STATUS_LABEL: Record<EscStatus, string> = { pendiente: 'Pendiente', en_seguimiento: 'En seguimiento', cerrada: 'Cerrada' };
export const ESC_STATUS_CHIP: Record<EscStatus, string> = { pendiente: 'sla-vencido', en_seguimiento: 'sla-riesgo', cerrada: 'sla-ok' };
export const ESC_KIND_LABEL: Record<EscUpdate['kind'], string> = { seguimiento: 'Seguimiento', reasignacion: 'Reasignación', prioridad: 'Prioridad', cierre: 'Cierre' };
export const isOpenEscalation = (s: string) => s === 'pendiente' || s === 'en_seguimiento';
