## 1. Concatenação e Junção dos QR Codes (Fase de Input)

O processo de união lida com múltiplos QR Codes (1 a $N$), recebidos em qualquer ordem. Cada QR Code de um Boletim de Urna (BU) contém o identificador `QRBU:i:n` no seu início, onde `i` é o índice atual (base 1) e `n` é o total de QR Codes do BU.

### Passo 1.1: Extração dos Metadados do Cabeçalho

Para cada string de QR Code capturada:

1. Aplique uma Expressão Regular para extrair o padrão `QRBU:(\d+):(\d+)`.
2. Armazene o **Índice Atual (`i`)** e o **Total Esperado (`n`)**.
3. Se o padrão `QRBU` não for encontrado, rejeite o trecho como inválido.

### Passo 1.2: Ordenação e Validação de Integridade da Sequência

1. Crie uma lista/array de objetos contendo `{ indice: i, total: n, conteudo: string }`.
2. Ordene a lista de forma ascendente pelo campo `indice`.
3. Valide se a quantidade de elementos recebidos é igual a `n`.
4. Valide se a sequência numérica é estritamente contínua de `1` até `n` (ex: `1, 2, 3... n`). Se faltar algum número (ex: tem 1 e 3, mas falta o 2), interrompa o processo solicitando o QR Code ausente.

### Passo 1.3: Limpeza de Rodapés Criptográficos

Cada parte individual possui uma hash parcial (`HASH:HEX`), e a última parte possui uma assinatura digital (`ASSI:HEX`).

1. Em cada substring individual (ou na junção), remova o padrão `HASH:[A-F0-9]+` via Regex.
2. Na última parte, remova o padrão `ASSI:[A-F0-9]+` via Regex.

### Passo 1.4: Concatenação do Fluxo Único

1. Junte todas as strings limpas da lista ordenada por um espaço em branco `' '`.
2. O resultado é uma **string contínua única** representando todo o payload textual do BU.

---

## 2. Tokenização do Fluxo de Dados

### Passo 2.1: Separação dos Tokens

1. Faça o `split` da string concatenada utilizando o delimitador de espaço em branco `/\s+/`.
2. O resultado é um array linear de **Tokens** (ex: `['QRBU:1:2', 'VRQR:6.0', 'ORIG:VOTA', ..., 'CARG:6', 'PART:93', '9301:1', ...]`).

---

## 3. Máquina de Estados e Parsing do Protocolo

A leitura da lista de tokens deve funcionar através de uma **máquina de estados iterativa**, pois a ordem e o contexto dos tokens definem o significado dos dados.

### Estudo do Estado do Parser:

O parser mantém variáveis de contexto dinâmico durante a iteração:

* `contextoLocalizacao`: `{ municipio, zona, local }`
* `cargoAtual`: `{ codigoCargo, votos: [] }`
* `partidoAtual`: `string`

### Regras de Transição por Token:

1. **Tokens de Localização Global**:
* Se token iniciar com `MUNI:`, defina `contextoLocalizacao.municipio = valor`.
* Se token iniciar com `ZONA:`, defina `contextoLocalizacao.zona = parseInt(valor)`.
* Se token iniciar com `LOCA:`, defina `contextoLocalizacao.local = valor`.


2. **Mudança de Cargo (`CARG:<codigo>`)**:
* Quando o token iniciar com `CARG:`, crie uma nova estrutura de cargo e adicione-a à lista de cargos processados.
* Redefina `partidoAtual = ''`.


3. **Mudança de Partido (`PART:<numero>`)**:
* Quando o token iniciar com `PART:`, atualize a variável `partidoAtual = valor`.


4. **Votação Nominal / Candidato (`<numero_candidato>:<qtd_votos>`)**:
* Se o token corresponder ao padrão `/^\d+:\d+$/` (ex: `9301:1`, `93:2`):
* Divida no caractere `:` para obter `numeroCandidato` e `qtdVotos`.
* **Regra do Partido**: Se `partidoAtual` estiver preenchido, use-o. Caso contrário, extraia os 2 primeiros dígitos de `numeroCandidato` (ex: para candidato `9301`, o partido é `93`).
* Adicione o objeto `{ numeroCandidato, numeroPartido, qtdVotos: parseInt(qtdVotos) }` ao `cargoAtual`.




5. **Outros Tokens de Controle/Estatística**:
* Tokens como `APTA:`, `APTS:`, `NOMI:`, `BRAN:`, `NULO:`, `LEGP:`, `TOTP:` servem para validação/auditoria de totais. Ignore-os na inserção direta de votos de candidatos ou utilize-os para asserção de integridade.



---

## 4. Algoritmo de Mapeamento para o Banco de Dados

O banco de dados relacional exige que as entidades sejam persistidas na ordem correta de dependência das Chaves Estrangeiras (FKs).

```
municipios
   └── local_votacao
          └── cargos
                 └── candidatos
                        └── votos (liga candidato + local_votacao)

```

### Passo 4.1: Persistência do Município (`public.municipios`)

1. Consulte `public.municipios` onde `codigo_municipio = contextoLocalizacao.municipio`.
2. Se existir, recupere o `id`.
3. Se não existir, faça `INSERT` na tabela `municipios` com `codigo_municipio` e `nome_municipio = 'Município <codigo>'` e recupere o `id` gerado.

### Passo 4.2: Persistência do Local de Votação (`public.local_votacao`)

1. Consulte `public.local_votacao` onde `codigo_local = contextoLocalizacao.local`, `zona = contextoLocalizacao.zona` e `fk_id_municipio = municipioId`.
2. Se existir, recupere o `id`.
3. Se não existir, faça `INSERT` na tabela `local_votacao` com `zona`, `fk_id_municipio`, `codigo_local` e `local_votacao = 'Local <codigo>'` e recupere o `id` gerado.

### Passo 4.3: Persistência do Cargo (`public.cargos`)

Para cada cargo identificado na lista:

1. Mapeie o `codigoCargo` para a descrição oficial do TSE (ex: `1` -> Presidente, `3` -> Governador, `5` -> Senador, `6` -> Deputado Federal, `7` -> Deputado Estadual).
2. Consulte `public.cargos` onde `codigo_cargo = codigoCargo`.
3. Se existir, recupere o `id`. Se não existir, insira o novo cargo e recupere o `id`.

### Passo 4.4: Persistência do Candidato (`public.candidatos`)

Para cada voto processado no cargo:

1. Consulte `public.candidatos` onde `nome_urna_candidato = numeroCandidato` E `fk_idcargo = cargoId`.
2. Se existir, recupere o `id`.
3. Se não existir, faça `INSERT` em `candidatos` informando `nome_partido = 'Partido <numeroPartido>'`, `numero_partido = numeroPartido`, `nome_candidato = 'Candidato <numeroCandidato>'`, `nome_urna_candidato = numeroCandidato` e `fk_idcargo = cargoId`. Recupere o `id` do candidato.

### Passo 4.5: Persistência da Votação (`public.votos`)

1. Com o `candidatoId` e o `localVotacaoId` em mãos, faça o `INSERT` na tabela `votos`:
* `numero_partido`: `numeroPartido`
* `fk_idcandidato`: `candidatoId`
* `qtd_votos`: `qtdVotos`
* `fk_idlocal_votacao`: `localVotacaoId`



---

## 5. Regras de Negócio e Casos de Borda (Edge Cases)

Anote as seguintes diretrizes para evitar erros durante a execução:

* **Transacionalidade ACID**: Todo o processo de gravação no banco de dados para um BU deve ocorrer dentro de uma **Transação de Banco de Dados (`BEGIN ... COMMIT`)**. Se ocorrer erro em qualquer inserção, aplique `ROLLBACK`.
* **Candidatos de Legenda / Votos de Partido**: Em votações proporcionais, tokens do tipo `LEGP:<votos>` indicam votos na legenda do partido. Se necessário armazenar voto de legenda, trate o partido como um registro de "candidato de legenda".
* **Fragmentação do Token entre QR Codes**: O protocolo do TSE garanta que tokens não são cortados pela metade na divisão dos QR Codes. A junção de strings por espaço garante a continuidade dos dados.
* **Duplicidade de Leitura**: Utilize cláusulas `SELECT` prévias ou regras de `ON CONFLICT` (`UPSERT`) para evitar a duplicação de dados caso o mesmo BU seja processado mais de uma vez.