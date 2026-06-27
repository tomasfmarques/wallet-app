# Google Play — Data Safety (respostas para o formulário)

> Respostas para o formulário *Data safety* da Play Console. Confirma cada uma
> contra o comportamento real antes de submeter — declarações falsas violam as
> políticas da Play. **Atualizado: 2026-06-27.**

## Resumo

- **A app recolhe dados?** Sim.
- **A app partilha dados com terceiros?** Não (para marketing/anúncios). Há
  *processadores* (alojamento, base de dados) que tratam dados em nosso nome.
- **Encriptação em trânsito?** Sim (TLS).
- **O utilizador pode pedir a eliminação dos dados?** Sim — URL público:
  https://wallet360.pt/eliminar-conta.html

## Tipos de dados recolhidos

| Categoria | Dado | Recolhido | Partilhado | Obrigatório | Finalidade |
|-----------|------|-----------|------------|-------------|------------|
| Info pessoal | Email | Sim | Não | Sim | Conta, autenticação |
| Info financeira | Dados financeiros do utilizador (créditos, investimentos, orçamento, transações importadas) | Sim | Não | Sim | Funcionalidade da app |
| Identificadores | ID de sessão / conta Google (se usado) | Sim | Não | Sim | Autenticação |
| Atividade na app | — | Não | — | — | — |
| Localização | — | Não | — | — | — |
| Contactos / Fotos / etc. | — | Não | — | — | — |

> **Notas:** a palavra-passe é guardada apenas como *hash* (bcrypt) — não como
> dado legível. Os extratos bancários são processados no dispositivo; só as
> linhas confirmadas são enviadas. Após eliminação só é retido um *hash*
> pseudonimizado do email (tabela `deletion_log`), não contabilizável como dado
> pessoal legível.
> **Se ativares `VITE_SENTRY_DSN`/`SENTRY_DSN`, declara também "Diagnostics / Crash logs".**

## Práticas de segurança

- Dados **encriptados em trânsito** (TLS).
- O utilizador pode **pedir a eliminação** dos dados (URL público + na app).
- O utilizador pode **exportar** os seus dados (Definições → Exportar, JSON).
- Tratamento conforme o RGPD.

## Links a fornecer à Play

- **Política de privacidade:** https://wallet360.pt/privacidade.html
- **Eliminação de conta:** https://wallet360.pt/eliminar-conta.html
