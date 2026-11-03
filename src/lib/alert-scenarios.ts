// Escenarios de notificacion al equipo del helipuerto. Cada destinatario elige en cuales quiere
// estar copiado (settings.alertSubscriptions). Shared by the server and the settings page.
export const ALERT_SCENARIOS = [
  "pending_approval", // Reserva que requiere aprobacion (sin titular a bordo o cupo agotado)
  "booking_activity", // Reserva confirmada o cancelada (uso regular del helipuerto)
  "rule_exception", // Reserva fuera de horario, con aviso corto, franja larga o dia bloqueado (Art. 5.1, 6.1, 19.1)
  "late_cancellation", // Cancelacion tardia o no-show, y su reiteracion (Art. 6.4)
  "unauthorized_operation", // Operacion sin reserva o fuera de franja (Art. 24.3)
  "membership_quota", // Pocas operaciones disponibles o cupo agotado (Contrato 2.4)
  "misuse", // Matricula recurrente sin titular de membresia a bordo
] as const;

export type AlertScenario = (typeof ALERT_SCENARIOS)[number];

export interface AlertSubscription {
  email: string;
  scenarios: AlertScenario[];
}
