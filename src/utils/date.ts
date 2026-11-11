const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/**
 * Retorna a data no formato YYYY-MM-DD no fuso horário de Brasília (ou configurado).
 */
export function getLocalDateStr(date: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

/**
 * Retorna o horário no formato HH:MM no fuso horário de Brasília.
 */
export function getLocalTimeStr(date: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): string {
  return date.toLocaleTimeString('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Retorna o nome do dia da semana em português no fuso horário de Brasília.
 */
export function getLocalWeekdayName(date: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    weekday: 'long'
  }).format(date);
}
