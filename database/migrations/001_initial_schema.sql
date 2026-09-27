CREATE TABLE users (
  id char(36) PRIMARY KEY DEFAULT (uuid()), display_name varchar(80) NOT NULL,
  email varchar(320), avatar_url text,
  status enum('active','suspended','deleted') NOT NULL DEFAULT 'active',
  last_login_at datetime(6), created_at datetime(6) NOT NULL DEFAULT current_timestamp(6),
  updated_at datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6), deleted_at datetime(6),
  CONSTRAINT users_email_normalized CHECK (email IS NULL OR email = lower(trim(email))),
  CONSTRAINT users_deleted_state CHECK ((status='deleted' AND deleted_at IS NOT NULL) OR (status<>'deleted' AND deleted_at IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_identities (
  id char(36) PRIMARY KEY DEFAULT (uuid()), user_id char(36) NOT NULL,
  provider enum('google','naver') NOT NULL, provider_subject varchar(255) NOT NULL,
  provider_email varchar(320), email_verified boolean, profile_snapshot json NOT NULL,
  linked_at datetime(6) NOT NULL DEFAULT current_timestamp(6), last_login_at datetime(6) NOT NULL DEFAULT current_timestamp(6),
  updated_at datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  CONSTRAINT auth_identities_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT auth_identities_subject_not_blank CHECK (trim(provider_subject)<>''),
  CONSTRAINT auth_identities_email_normalized CHECK (provider_email IS NULL OR provider_email=lower(trim(provider_email))),
  CONSTRAINT auth_identities_provider_subject_unique UNIQUE (provider, provider_subject),
  CONSTRAINT auth_identities_user_provider_unique UNIQUE (user_id, provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_sessions (
  id char(36) PRIMARY KEY DEFAULT (uuid()), user_id char(36) NOT NULL,
  refresh_token_hash binary(32) NOT NULL UNIQUE, user_agent text, ip_address varchar(45),
  expires_at datetime(6) NOT NULL, last_used_at datetime(6) NOT NULL DEFAULT current_timestamp(6),
  revoked_at datetime(6), created_at datetime(6) NOT NULL DEFAULT current_timestamp(6),
  CONSTRAINT user_sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_sessions_expiry_after_creation CHECK (expires_at>created_at),
  INDEX user_sessions_active_idx (user_id, revoked_at, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE oauth_states (
  state_hash binary(32) PRIMARY KEY, provider enum('google','naver') NOT NULL,
  code_verifier_ciphertext text, redirect_uri text NOT NULL, expires_at datetime(6) NOT NULL,
  consumed_at datetime(6), created_at datetime(6) NOT NULL DEFAULT current_timestamp(6),
  CONSTRAINT oauth_states_expiry_after_creation CHECK (expires_at>created_at), INDEX oauth_states_expiry_idx (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE families (
  id char(36) PRIMARY KEY DEFAULT (uuid()), name varchar(80) NOT NULL DEFAULT '우리 가족',
  adult_count smallint unsigned NOT NULL DEFAULT 1 CHECK (adult_count BETWEEN 1 AND 20),
  mobility_aid enum('wagon','stroller','none'), created_by char(36) NOT NULL,
  created_at datetime(6) NOT NULL DEFAULT current_timestamp(6),
  updated_at datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  CONSTRAINT families_creator_fk FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_members (
  family_id char(36) NOT NULL, user_id char(36) NOT NULL,
  role enum('owner','admin','member') NOT NULL DEFAULT 'member',
  owner_family_id char(36) AS (IF(role='owner',family_id,NULL)) PERSISTENT,
  joined_at datetime(6) NOT NULL DEFAULT current_timestamp(6), PRIMARY KEY (family_id,user_id),
  UNIQUE KEY family_single_owner_unique (owner_family_id),
  CONSTRAINT family_members_family_fk FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  CONSTRAINT family_members_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE children (
  id char(36) PRIMARY KEY DEFAULT (uuid()), family_id char(36) NOT NULL, nickname varchar(40) NOT NULL,
  birth_year smallint unsigned CHECK (birth_year BETWEEN 2000 AND 2200),
  birth_month tinyint unsigned CHECK (birth_month BETWEEN 1 AND 12), notes text,
  created_at datetime(6) NOT NULL DEFAULT current_timestamp(6),
  updated_at datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  CONSTRAINT children_family_fk FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE preference_catalog (
  code varchar(50) PRIMARY KEY, label varchar(80) NOT NULL, category varchar(30) NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_preferences (
  family_id char(36) NOT NULL, preference_code varchar(50) NOT NULL,
  weight tinyint NOT NULL DEFAULT 1 CHECK (weight BETWEEN -2 AND 2), PRIMARY KEY (family_id,preference_code),
  CONSTRAINT family_preferences_family_fk FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  CONSTRAINT family_preferences_catalog_fk FOREIGN KEY (preference_code) REFERENCES preference_catalog(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE places (
  id char(36) PRIMARY KEY DEFAULT (uuid()), naver_place_id varchar(100) UNIQUE, name varchar(200) NOT NULL,
  category varchar(80), road_address varchar(300), jibun_address varchar(300),
  latitude decimal(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude decimal(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  phone varchar(30), website_url text, min_age tinyint unsigned CHECK (min_age BETWEEN 0 AND 19),
  max_age tinyint unsigned CHECK (max_age BETWEEN 0 AND 19), price_min int unsigned, price_max int unsigned,
  is_active boolean NOT NULL DEFAULT true, metadata json NOT NULL,
  created_at datetime(6) NOT NULL DEFAULT current_timestamp(6),
  updated_at datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  CONSTRAINT places_age_range CHECK (min_age IS NULL OR max_age IS NULL OR min_age<=max_age),
  CONSTRAINT places_price_range CHECK (price_min IS NULL OR price_max IS NULL OR price_min<=price_max),
  INDEX places_coordinates_idx (latitude,longitude), FULLTEXT INDEX places_name_search_idx (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE facility_catalog (
  code varchar(50) PRIMARY KEY, label varchar(80) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE place_facilities (
  place_id char(36) NOT NULL, facility_code varchar(50) NOT NULL, details text, verified_at datetime(6),
  PRIMARY KEY (place_id,facility_code),
  CONSTRAINT place_facilities_place_fk FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE,
  CONSTRAINT place_facilities_catalog_fk FOREIGN KEY (facility_code) REFERENCES facility_catalog(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE place_hours (
  place_id char(36) NOT NULL, day_of_week tinyint unsigned NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  sequence smallint unsigned NOT NULL DEFAULT 1 CHECK (sequence>0), opens_at time, closes_at time,
  is_closed boolean NOT NULL DEFAULT false, PRIMARY KEY (place_id,day_of_week,sequence),
  CONSTRAINT place_hours_place_fk FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE,
  CONSTRAINT place_hours_closed_or_timed CHECK ((is_closed AND opens_at IS NULL AND closes_at IS NULL) OR (NOT is_closed AND opens_at IS NOT NULL AND closes_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE courses (
  id char(36) PRIMARY KEY DEFAULT (uuid()), user_id char(36) NOT NULL, family_id char(36), title varchar(160) NOT NULL,
  status enum('draft','saved','archived') NOT NULL DEFAULT 'draft', travel_date date, region varchar(100),
  transport enum('car','public_transit','walk','mixed') NOT NULL DEFAULT 'car', starts_at time, ends_at time,
  budget int unsigned, estimated_cost int unsigned, input_snapshot json NOT NULL,
  created_at datetime(6) NOT NULL DEFAULT current_timestamp(6),
  updated_at datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  CONSTRAINT courses_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT courses_family_fk FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE SET NULL,
  CONSTRAINT courses_time_range CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at<ends_at),
  INDEX courses_user_recent_idx (user_id,updated_at), INDEX courses_family_date_idx (family_id,travel_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE course_stops (
  id char(36) PRIMARY KEY DEFAULT (uuid()), course_id char(36) NOT NULL, place_id char(36),
  position smallint unsigned NOT NULL, kind enum('origin','place','destination') NOT NULL DEFAULT 'place',
  name_snapshot varchar(200) NOT NULL, latitude_snapshot decimal(9,6) NOT NULL CHECK (latitude_snapshot BETWEEN -90 AND 90),
  longitude_snapshot decimal(9,6) NOT NULL CHECK (longitude_snapshot BETWEEN -180 AND 180),
  arrival_at time, departure_at time, estimated_cost int unsigned, travel_minutes_from_previous int unsigned,
  memo text, metadata json NOT NULL, created_at datetime(6) NOT NULL DEFAULT current_timestamp(6),
  updated_at datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  CONSTRAINT course_stops_course_fk FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT course_stops_place_fk FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE SET NULL,
  CONSTRAINT course_stops_position_unique UNIQUE (course_id,position),
  CONSTRAINT course_stops_time_range CHECK (arrival_at IS NULL OR departure_at IS NULL OR arrival_at<=departure_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE favorite_places (
  user_id char(36) NOT NULL, place_id char(36) NOT NULL, created_at datetime(6) NOT NULL DEFAULT current_timestamp(6),
  PRIMARY KEY (user_id,place_id),
  CONSTRAINT favorite_places_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT favorite_places_place_fk FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE consent_records (
  id char(36) PRIMARY KEY DEFAULT (uuid()), user_id char(36) NOT NULL, consent_type varchar(50) NOT NULL,
  policy_version varchar(30) NOT NULL, granted boolean NOT NULL,
  recorded_at datetime(6) NOT NULL DEFAULT current_timestamp(6), ip_address varchar(45),
  CONSTRAINT consent_records_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX consent_records_user_type_idx (user_id,consent_type,recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
