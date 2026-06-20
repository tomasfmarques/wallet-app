# Google Play — Data Safety (rascunho de respostas)

> **DRAFT** para o formulário *Data safety* da Play Console. Confirma cada
> resposta contra o comportamento real antes de submeter — declarações falsas
> violam as políticas da Play.

## Resumo

- **A app recolhe dados?** Sim.
- **A app partilha dados com terceiros?** Não (para fins de marketing/anúncios).
  Há *processadores* (alojamento, base de dados) que tratam dados em nosso nome.
- **Encriptação em trânsito?** Sim (TLS).
- **O utilizador pode pedir a eliminação dos dados?** Sim — ver
  [account-deletion.md](account-deletion.md).

## Tipos de dados recolhidos

| Categoria | Dado | Recolhido | Partilhado | Obrigatório | Finalidade |
|-----------|------|-----------|------------|-------------|------------|
| Info pessoal | Email | Sim | Não | Sim | Conta, autenticação |
| Info financeira | Dados financeiros do utilizador (créditos, investimentos, orçamento, transações importadas) | Sim | Não | Sim | Funcionalidade da app |
| Identificadores | ID de sessão / conta Google (se usado) | Sim | Não | Sim | Autenticação |
| Atividade na app | — | Não | — | — | — |
| Localização | — | Não | — | — | — |
| Contactos / Fotos / etc. | — | Não | — | — | — |

> **Nota:** a palavra-passe é guardada apenas como *hash* (bcrypt) — não como
> dado legível. Os extratos bancários são processados no dispositivo; só as
> linhas confirmadas são enviadas.
> [Se ativares Sentry, declara "Diagnostics / Crash logs".]

## Práticas de segurança

- Dados **encriptados em trânsito** (TLS).
- O utilizador pode **pedir a eliminação** dos dados (link de eliminação).
- O utilizador pode **exportar** os seus dados (Definições → Exportar).
- Segue um processo de tratamento de dados conforme o RGPD.

## Links a fornecer à Play

- Política de privacidade: [URL público de privacy-policy.md]
- Eliminação de conta: [URL público de account-deletion.md]
