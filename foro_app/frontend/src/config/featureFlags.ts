/**
 * Flags de estágio de produto — "isso já está pronto pra algum cliente ver?".
 *
 * Isso é DIFERENTE do toggle de módulo por conta (ver `modulesApi` / tabela
 * `account_modules`): aquele é uma decisão do admin da plataforma sobre UMA
 * conta específica ("esse escritório não paga por isso"). Este arquivo é
 * sobre o produto como um todo ("isso ainda não foi lançado pra ninguém").
 *
 * As telas aqui já existem e já chamam a API real — só ficam atrás de um
 * selo "Em breve" (ver `components/ComingSoon.tsx`) até o negócio estar
 * pronto pra liberar (provedor contratado, precificação definida, etc).
 * Lançar é só virar a flag pra `false` — nenhuma mudança de backend.
 */
export const LOCKED_FEATURES = {
  pesquisaCnpj: true,
  pesquisaCpf: true,
  pesquisaProcessual: true,
  pesquisaInteligente: true,
} as const

export type LockedFeatureKey = keyof typeof LOCKED_FEATURES
