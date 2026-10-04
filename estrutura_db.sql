-- public.cargos definição

-- Drop table

-- DROP TABLE public.cargos;

CREATE TABLE public.cargos (
	id serial4 NOT NULL,
	codigo_cargo varchar(50) NOT NULL,
	nome_cargo varchar(255) NOT NULL,
	CONSTRAINT cargos_pkey PRIMARY KEY (id)
);


-- public.municipios definição

-- Drop table

-- DROP TABLE public.municipios;

CREATE TABLE public.municipios (
	id serial4 NOT NULL,
	codigo_municipio varchar(50) NOT NULL,
	nome_municipio varchar(255) NOT NULL,
	CONSTRAINT municipios_pkey PRIMARY KEY (id)
);


-- public.candidatos definição

-- Drop table

-- DROP TABLE public.candidatos;

CREATE TABLE public.candidatos (
	id serial4 NOT NULL,
	nome_partido varchar(255) NOT NULL,
	numero_partido varchar(50) NOT NULL,
	nome_candidato varchar(50) NOT NULL,
	nome_urna_candidato varchar(255) NOT NULL,
	fk_idcargo int4 NULL,
	CONSTRAINT candidatos_pkey PRIMARY KEY (id),
	CONSTRAINT candidatos_fk_idcargo_fkey FOREIGN KEY (fk_idcargo) REFERENCES public.cargos(id) ON DELETE CASCADE
);


-- public.local_votacao definição

-- Drop table

-- DROP TABLE public.local_votacao;

CREATE TABLE public.local_votacao (
	id serial4 NOT NULL,
	zona int4 NOT NULL,
	fk_id_municipio int4 NOT NULL,
	codigo_local varchar(50) NOT NULL,
	local_votacao varchar(255) NOT NULL,
	CONSTRAINT local_votacao_pkey PRIMARY KEY (id),
	CONSTRAINT local_votacao_fk_id_municipio_fkey FOREIGN KEY (fk_id_municipio) REFERENCES public.municipios(id) ON DELETE CASCADE
);


-- public.votos definição

-- Drop table

-- DROP TABLE public.votos;

CREATE TABLE public.votos (
	id serial4 NOT NULL,
	numero_partido varchar(50) NOT NULL,
	fk_idcandidato int4 NOT NULL,
	qtd_votos int4 NOT NULL,
	fk_idlocal_votacao int4 NOT NULL,
	CONSTRAINT votos_pkey PRIMARY KEY (id),
	CONSTRAINT votos_fk_idlocal_votacao_fkey FOREIGN KEY (fk_idlocal_votacao) REFERENCES public.local_votacao(id) ON DELETE CASCADE
);
