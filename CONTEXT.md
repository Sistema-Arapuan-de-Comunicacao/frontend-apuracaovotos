# Contexto do Projeto Apuração Votos
## Objetivo
O objetivo deste projeto visa criar um software que permita acompanhar em tempo real a apuração dos votos. Estes dados virão a partir da leitura de QR CODES presentes nos Boletins de Urena (BUs). A documentação para ler e interpretar estes documentos estão no caminho "./docs/manual-do-qr-code-no-boletim-de-urna.md".

Haveremos Motoboys nos locais de votação que escanearão o QR CODE via interface web, estes dados serão processados e enviados para o banco, que irá servir os dados para um dashboard.

## Arquitetura
A aplicação constará com 3 partes: O front que irá ler os QR CODES, processar e enviar para o banco os dados e ao mesmo tempo, mandar uma requisição para um endpoint da aplicação next do dashboard, que irá consultar o banco e atualizar os dados, um pseudo EDD com SSE.

O banco é um postgres 18.

### DDL do banco
As informações das tabelas e campos do banco de dados estão presentes em ./docs/ddl_banco.md
