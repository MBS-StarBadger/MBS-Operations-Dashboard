--
-- PostgreSQL database dump
--

\restrict GlMzlJ5iVtFaC4FZ6HMdLGSZpgjfQmBgbFJb7NBnnfejgfFCBNGEnecZdnhto1w

-- Dumped from database version 18.3 (Ubuntu 18.3-1)
-- Dumped by pg_dump version 18.3 (Ubuntu 18.3-1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: mbsadmin
--

CREATE TABLE public.activity_log (
    id integer NOT NULL,
    user_id integer,
    action character varying(100),
    details text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.activity_log OWNER TO mbsadmin;

--
-- Name: activity_log_id_seq; Type: SEQUENCE; Schema: public; Owner: mbsadmin
--

CREATE SEQUENCE public.activity_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.activity_log_id_seq OWNER TO mbsadmin;

--
-- Name: activity_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: mbsadmin
--

ALTER SEQUENCE public.activity_log_id_seq OWNED BY public.activity_log.id;


--
-- Name: assets; Type: TABLE; Schema: public; Owner: mbsadmin
--

CREATE TABLE public.assets (
    id integer NOT NULL,
    asset_tag character varying(50),
    type character varying(50),
    name character varying(100),
    make character varying(100),
    model character varying(100),
    serial_number character varying(100),
    assigned_to character varying(100),
    location character varying(100),
    status character varying(50) DEFAULT 'available'::character varying,
    condition character varying(50),
    windows_license boolean DEFAULT false,
    autopilot_ready boolean DEFAULT false,
    notes text,
    history jsonb DEFAULT '[]'::jsonb,
    shipping_records jsonb DEFAULT '[]'::jsonb,
    qr_code character varying(100),
    photos jsonb DEFAULT '[]'::jsonb,
    entra_name character varying(100),
    department character varying(100),
    imei character varying(100),
    warranty_expiry date,
    warranty_expired boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.assets OWNER TO mbsadmin;

--
-- Name: assets_id_seq; Type: SEQUENCE; Schema: public; Owner: mbsadmin
--

CREATE SEQUENCE public.assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.assets_id_seq OWNER TO mbsadmin;

--
-- Name: assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: mbsadmin
--

ALTER SEQUENCE public.assets_id_seq OWNED BY public.assets.id;


--
-- Name: consumables; Type: TABLE; Schema: public; Owner: mbsadmin
--

CREATE TABLE public.consumables (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    quantity integer DEFAULT 0,
    low_at integer DEFAULT 2,
    notes text,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.consumables OWNER TO mbsadmin;

--
-- Name: consumables_id_seq; Type: SEQUENCE; Schema: public; Owner: mbsadmin
--

CREATE SEQUENCE public.consumables_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.consumables_id_seq OWNER TO mbsadmin;

--
-- Name: consumables_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: mbsadmin
--

ALTER SEQUENCE public.consumables_id_seq OWNED BY public.consumables.id;


--
-- Name: shirts; Type: TABLE; Schema: public; Owner: mbsadmin
--

CREATE TABLE public.shirts (
    id integer NOT NULL,
    color character varying(20) NOT NULL,
    size character varying(10) NOT NULL,
    quantity integer DEFAULT 0,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.shirts OWNER TO mbsadmin;

--
-- Name: shirts_id_seq; Type: SEQUENCE; Schema: public; Owner: mbsadmin
--

CREATE SEQUENCE public.shirts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.shirts_id_seq OWNER TO mbsadmin;

--
-- Name: shirts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: mbsadmin
--

ALTER SEQUENCE public.shirts_id_seq OWNED BY public.shirts.id;


--
-- Name: tools; Type: TABLE; Schema: public; Owner: mbsadmin
--

CREATE TABLE public.tools (
    id integer NOT NULL,
    tool_tag character varying(50),
    name character varying(100) NOT NULL,
    category character varying(50),
    condition character varying(50),
    status character varying(50) DEFAULT 'In Storage'::character varying,
    assigned_to character varying(100),
    notes text,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.tools OWNER TO mbsadmin;

--
-- Name: tools_id_seq; Type: SEQUENCE; Schema: public; Owner: mbsadmin
--

CREATE SEQUENCE public.tools_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tools_id_seq OWNER TO mbsadmin;

--
-- Name: tools_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: mbsadmin
--

ALTER SEQUENCE public.tools_id_seq OWNED BY public.tools.id;


--
-- Name: trucks; Type: TABLE; Schema: public; Owner: mbsadmin
--

CREATE TABLE public.trucks (
    id integer NOT NULL,
    truck_tag character varying(50),
    year integer,
    make_model character varying(100),
    plate character varying(20),
    status character varying(50) DEFAULT 'In Service'::character varying,
    assigned_to character varying(100),
    mileage integer,
    last_service date,
    next_service date,
    notes text,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.trucks OWNER TO mbsadmin;

--
-- Name: trucks_id_seq; Type: SEQUENCE; Schema: public; Owner: mbsadmin
--

CREATE SEQUENCE public.trucks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.trucks_id_seq OWNER TO mbsadmin;

--
-- Name: trucks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: mbsadmin
--

ALTER SEQUENCE public.trucks_id_seq OWNED BY public.trucks.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: mbsadmin
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    password character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'user'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.users OWNER TO mbsadmin;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: mbsadmin
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO mbsadmin;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: mbsadmin
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: activity_log id; Type: DEFAULT; Schema: public; Owner: mbsadmin
--

ALTER TABLE ONLY public.activity_log ALTER COLUMN id SET DEFAULT nextval('public.activity_log_id_seq'::regclass);


--
-- Name: assets id; Type: DEFAULT; Schema: public; Owner: mbsadmin
--

ALTER TABLE ONLY public.assets ALTER COLUMN id SET DEFAULT nextval('public.assets_id_seq'::regclass);


--
-- Name: consumables id; Type: DEFAULT; Schema: public; Owner: mbsadmin
--

ALTER TABLE ONLY public.consumables ALTER COLUMN id SET DEFAULT nextval('public.consumables_id_seq'::regclass);


--
-- Name: shirts id; Type: DEFAULT; Schema: public; Owner: mbsadmin
--

ALTER TABLE ONLY public.shirts ALTER COLUMN id SET DEFAULT nextval('public.shirts_id_seq'::regclass);


--
-- Name: tools id; Type: DEFAULT; Schema: public; Owner: mbsadmin
--

ALTER TABLE ONLY public.tools ALTER COLUMN id SET DEFAULT nextval('public.tools_id_seq'::regclass);


--
-- Name: trucks id; Type: DEFAULT; Schema: public; Owner: mbsadmin
--

ALTER TABLE ONLY public.trucks ALTER COLUMN id SET DEFAULT nextval('public.trucks_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: mbsadmin
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: mbsadmin
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: assets assets_asset_tag_key; Type: CONSTRAINT; Schema: public; Owner: mbsadmin
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_asset_tag_key UNIQUE (asset_tag);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: mbsadmin
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: consumables consumables_pkey; Type: CONSTRAINT; Schema: public; Owner: mbsadmin
--

ALTER TABLE ONLY public.consumables
    ADD CONSTRAINT consumables_pkey PRIMARY KEY (id);


--
-- Name: shirts shirts_color_size_key; Type: CONSTRAINT; Schema: public; Owner: mbsadmin
--

ALTER TABLE ONLY public.shirts
    ADD CONSTRAINT shirts_color_size_key UNIQUE (color, size);


--
-- Name: shirts shirts_pkey; Type: CONSTRAINT; Schema: public; Owner: mbsadmin
--

ALTER TABLE ONLY public.shirts
    ADD CONSTRAINT shirts_pkey PRIMARY KEY (id);


--
-- Name: tools tools_pkey; Type: CONSTRAINT; Schema: public; Owner: mbsadmin
--

ALTER TABLE ONLY public.tools
    ADD CONSTRAINT tools_pkey PRIMARY KEY (id);


--
-- Name: trucks trucks_pkey; Type: CONSTRAINT; Schema: public; Owner: mbsadmin
--

ALTER TABLE ONLY public.trucks
    ADD CONSTRAINT trucks_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: mbsadmin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: mbsadmin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: activity_log activity_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: mbsadmin
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT ALL ON SCHEMA public TO mbsadmin;


--
-- PostgreSQL database dump complete
--

\unrestrict GlMzlJ5iVtFaC4FZ6HMdLGSZpgjfQmBgbFJb7NBnnfejgfFCBNGEnecZdnhto1w

