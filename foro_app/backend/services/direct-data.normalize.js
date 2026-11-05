/**
 * direct-data.normalize.js — transforma a resposta da Direct Data no formato interno do Foro (campos em
 * snake_case, datas ISO, telefones formatados, listas sem duplicatas).
 */
const N = require('../utils/lead-normalize');

const str = (v) => { const s = N.clean(v); return s || null; };
const isoDate = (v) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(v || '')) || /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  if (!m) return null;
  return m[0].includes('/') ? `${m[3]}-${m[2]}-${m[1]}` : `${m[1]}-${m[2]}-${m[3]}`;
};
const num = (v) => { if (v === null || v === undefined || v === '') return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };

function phones(list) {
  const out = []; const seen = new Set();
  for (const p of Array.isArray(list) ? list : []) {
    const raw = str(p?.telefoneComDDD); if (!raw) continue;
    const n = N.normPhone(raw);
    const numero = n && n.valid ? n.value : raw;
    const key = N.digits(numero); if (!key || seen.has(key)) continue; seen.add(key);
    out.push({
      numero, tipo: str(p?.tipoTelefone), operadora: str(p?.operadora),
      whatsapp: p?.whatsApp === true ? true : p?.whatsApp === false ? false : null,
      bloqueado_telemarketing: p?.telemarketingBloqueado === true ? true : p?.telemarketingBloqueado === false ? false : null,
    });
  }
  return out;
}
function emails(list) {
  const out = []; const seen = new Set();
  for (const e of Array.isArray(list) ? list : []) {
    const v = str(e?.enderecoEmail)?.toLowerCase(); if (!v || seen.has(v)) continue; seen.add(v); out.push(v);
  }
  return out;
}
function addresses(list) {
  return (Array.isArray(list) ? list : []).map(a => ({
    logradouro: str(a?.logradouro), numero: str(a?.numero), complemento: str(a?.complemento), bairro: str(a?.bairro),
    cidade: str(a?.cidade), uf: str(a?.uf)?.toUpperCase() || null, cep: N.normCep(a?.cep) || str(a?.cep),
  })).filter(a => a.logradouro || a.cidade || a.cep);
}

function cpf(r) {
  return {
    cpf: N.digits(r.cpf), nome: str(r.nome), sexo: str(r.sexo), data_nascimento: isoDate(r.dataNascimento), idade: num(r.idade),
    nome_mae: str(r.nomeMae), signo: str(r.signo), renda_estimada: num(r.rendaEstimada), renda_faixa: str(r.rendaFaixaSalarial),
    telefones: phones(r.telefones), emails: emails(r.emails), enderecos: addresses(r.enderecos),
  };
}
function cnpj(r) {
  return {
    cnpj: N.digits(r.cnpj), razao_social: str(r.razaoSocial), nome_fantasia: str(r.nomeFantasia), data_fundacao: isoDate(r.dataFundacao),
    situacao_cadastral: str(r.situacaoCadastral), porte: str(r.porte), matriz: r.matriz === true ? true : r.matriz === false ? false : null,
    natureza_juridica: str(r.naturezaJuridicaDescricao), tipo_empresa: str(r.tipoEmpresa), ramo: str(r.ramo),
    cnae: r.cnaeCodigo ? { codigo: String(r.cnaeCodigo), descricao: str(r.cnaeDescricao) } : null,
    cnaes_secundarios: (Array.isArray(r.cnaEsSecundarios) ? r.cnaEsSecundarios : []).map(c => ({ codigo: String(c?.cnaeCodigoSecundario ?? ''), descricao: str(c?.cnaeDescricaoSecundario) })).filter(c => c.codigo),
    quantidade_funcionarios: num(r.quantidadeFuncionarios), faixa_funcionarios: str(r.faixaFuncionarios), faixa_faturamento: str(r.faixaFaturamento),
    telefones: phones(r.telefones), emails: emails(r.emails), enderecos: addresses(r.enderecos),
    socios: (Array.isArray(r.socios) ? r.socios : []).map(s => ({ nome: str(s?.nome), documento: str(s?.documento), cargo: str(s?.cargo), data_entrada: isoDate(s?.dataEntrada) })).filter(s => s.nome),
  };
}
function processos(r) {
  const list = Array.isArray(r.processos) ? r.processos : [];
  return {
    documento: N.digits(r.documentoConsultado), total: num(r.totalProcessos) ?? list.length, observacoes: str(r.observacoes),
    processos: list.map(p => ({
      numero_cnj: str(p?.numeroProcesso), tribunal: str(p?.tribunal), grau: str(p?.grau), classe: str(p?.classe),
      assunto: str(p?.assuntoPrincipal), segmento: str(p?.segmento), status: str(p?.status), valor_acao: num(p?.valorAcao),
      data_ajuizamento: isoDate(p?.dataAjuizamento),
      ultima_movimentacao: str(p?.ultimaMovimentacao?.descricao), data_ultima_movimentacao: isoDate(p?.ultimaMovimentacao?.data),
      partes: (Array.isArray(p?.partes) ? p.partes : []).map(x => ({ nome: str(x?.nomeCompleto), polo: str(x?.polo), tipo: str(x?.tipo), documento: str(x?.documento) })).filter(x => x.nome),
    })),
  };
}

module.exports = { cpf, cnpj, processos, phones, emails, addresses, isoDate };
