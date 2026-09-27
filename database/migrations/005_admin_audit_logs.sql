CREATE TABLE login_events (
  id char(36) PRIMARY KEY DEFAULT (uuid()),
  user_id char(36), provider enum('google','naver'),
  email_snapshot varchar(320), result enum('started','success','failure','logout') NOT NULL,
  failure_reason varchar(120), ip_address varchar(45), user_agent text,
  occurred_at datetime(6) NOT NULL DEFAULT current_timestamp(6),
  CONSTRAINT login_events_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX login_events_occurred_idx (occurred_at),
  INDEX login_events_result_idx (result,occurred_at),
  INDEX login_events_email_idx (email_snapshot,occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE page_view_events (
  id char(36) PRIMARY KEY DEFAULT (uuid()),
  user_id char(36), visitor_id varchar(64) NOT NULL,
  page_key varchar(80) NOT NULL, page_title varchar(160), path varchar(500) NOT NULL,
  referrer varchar(500), ip_address varchar(45), user_agent text,
  viewed_at datetime(6) NOT NULL DEFAULT current_timestamp(6),
  CONSTRAINT page_view_events_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT page_view_events_visitor_not_blank CHECK (trim(visitor_id)<>''),
  CONSTRAINT page_view_events_page_not_blank CHECK (trim(page_key)<>''),
  INDEX page_view_events_viewed_idx (viewed_at),
  INDEX page_view_events_page_idx (page_key,viewed_at),
  INDEX page_view_events_visitor_idx (visitor_id,viewed_at),
  INDEX page_view_events_user_idx (user_id,viewed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
