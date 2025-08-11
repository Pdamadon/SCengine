-- AI Shopping Scraper - PostgreSQL Schema
-- Raw data storage and training data generation

-- =====================================================
-- ENUMS AND TYPES
-- =====================================================

CREATE TYPE site_type_enum AS ENUM ('ecommerce', 'booking', 'directory', 'comparison');
CREATE TYPE session_status_enum AS ENUM ('running', 'completed', 'failed', 'partial');
CREATE TYPE page_type_enum AS ENUM ('homepage', 'category', 'product', 'cart', 'checkout', 'booking', 'contact', 'search_results');
CREATE TYPE interaction_type_enum AS ENUM ('click', 'scroll', 'type', 'select', 'hover', 'wait', 'extract');
CREATE TYPE component_type_enum AS ENUM (
  'navigation', 'product_search', 'product_selection', 'variant_selection', 
  'cart_operations', 'checkout', 'price_comparison', 'booking_search', 
  'availability_check', 'service_selection', 'appointment_booking'
);
CREATE TYPE processing_status_enum AS ENUM ('pending', 'processing', 'completed', 'failed');

-- =====================================================
-- RAW DATA STORAGE TABLES
-- =====================================================

-- Core scraping sessions
CREATE TABLE scraping_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain VARCHAR(255) NOT NULL,
  site_type site_type_enum NOT NULL,
  platform VARCHAR(100), -- shopify, wordpress, magento, custom
  user_agent TEXT,
  proxy_used VARCHAR(255),
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  status session_status_enum DEFAULT 'running',
  pages_scraped INTEGER DEFAULT 0,
  errors_encountered INTEGER DEFAULT 0,
  metadata JSONB, -- browser config, viewport, etc
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Raw scraped page content
CREATE TABLE raw_scrapes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES scraping_sessions(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  page_type page_type_enum,
  title TEXT,
  html_content TEXT,
  html_hash VARCHAR(64), -- for deduplication
  screenshot_path TEXT,
  network_requests JSONB, -- captured API calls
  dom_elements JSONB, -- key elements with selectors
  load_time_ms INTEGER,
  scraped_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- User interactions captured during scraping
CREATE TABLE raw_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES scraping_sessions(id) ON DELETE CASCADE,
  scrape_id UUID REFERENCES raw_scrapes(id) ON DELETE CASCADE,
  interaction_type interaction_type_enum NOT NULL,
  element_selector TEXT,
  element_text TEXT,
  input_value TEXT, -- for type interactions
  coordinates JSONB, -- {x: 100, y: 200} for clicks
  reasoning TEXT, -- why this interaction was performed
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  timestamp TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Raw price data snapshots
CREATE TABLE raw_price_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES scraping_sessions(id) ON DELETE CASCADE,
  scrape_id UUID REFERENCES raw_scrapes(id) ON DELETE CASCADE,
  product_identifier TEXT, -- SKU, URL, or unique ID
  product_title TEXT,
  current_price DECIMAL(10,2),
  original_price DECIMAL(10,2),
  currency CHAR(3) DEFAULT 'USD',
  discount_percentage DECIMAL(5,2),
  sale_reason TEXT, -- "Black Friday", "Clearance", etc
  availability_status VARCHAR(50), -- "in_stock", "out_of_stock", "limited"
  variant_info JSONB, -- size, color, etc
  price_selector TEXT, -- CSS selector used to extract price
  scraped_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Raw cart flow data
CREATE TABLE raw_cart_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES scraping_sessions(id) ON DELETE CASCADE,
  flow_step INTEGER NOT NULL, -- 1=product, 2=cart, 3=checkout, etc
  page_url TEXT NOT NULL,
  step_name VARCHAR(100), -- "add_to_cart", "view_cart", "checkout"
  form_data JSONB, -- captured form fields
  buttons_found JSONB, -- available action buttons
  validation_errors JSONB, -- any errors encountered
  success BOOLEAN DEFAULT true,
  processing_time_ms INTEGER,
  screenshot_path TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- TRAINING DATA TABLES
-- =====================================================

-- Processing jobs for raw data → training data transformation
CREATE TABLE processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES scraping_sessions(id) ON DELETE CASCADE,
  job_type VARCHAR(50) NOT NULL, -- "conversation_generation", "component_extraction"
  status processing_status_enum DEFAULT 'pending',
  progress_percentage INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  output_records INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Atomic training components
CREATE TABLE training_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES scraping_sessions(id) ON DELETE CASCADE,
  component_type component_type_enum NOT NULL,
  domain VARCHAR(255) NOT NULL,
  intent TEXT NOT NULL, -- what the user is trying to accomplish
  context_before JSONB, -- state before this component
  context_after JSONB, -- state after this component
  human_reasoning TEXT, -- why a human would take this action
  technical_implementation JSONB, -- selectors, actions taken
  success_criteria TEXT, -- how to determine if action succeeded
  confidence_score DECIMAL(3,2) DEFAULT 0.5,
  validated BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Conversational training data in OpenAI format
CREATE TABLE conversation_training (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES scraping_sessions(id) ON DELETE CASCADE,
  component_id UUID REFERENCES training_components(id) ON DELETE CASCADE,
  conversation_turn INTEGER NOT NULL, -- 1st turn, 2nd turn, etc
  prompt TEXT NOT NULL, -- user input + context
  completion TEXT NOT NULL, -- assistant response
  context JSONB, -- site data that informed the response
  user_intent JSONB, -- parsed user goals
  actions_taken JSONB, -- what actions the assistant performed
  results_found JSONB, -- products, appointments, etc found
  confidence_score DECIMAL(3,2) DEFAULT 0.5,
  validated BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Training scenarios (complete flows)
CREATE TABLE training_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES scraping_sessions(id) ON DELETE CASCADE,
  scenario_name VARCHAR(255) NOT NULL,
  scenario_type VARCHAR(100) NOT NULL, -- "product_purchase", "service_booking", "price_comparison"
  user_goal TEXT NOT NULL, -- "Find and buy running shoes under $100"
  domain VARCHAR(255) NOT NULL,
  component_sequence UUID[], -- ordered array of component IDs
  conversation_turns UUID[], -- ordered array of conversation IDs
  success_rate DECIMAL(3,2),
  total_steps INTEGER,
  completion_time_estimate INTEGER, -- estimated seconds to complete
  difficulty_level INTEGER CHECK (difficulty_level BETWEEN 1 AND 5),
  tags TEXT[], -- for categorization and search
  created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- ANALYTICS AND METRICS TABLES
-- =====================================================

-- Daily aggregated statistics
CREATE TABLE daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  total_sessions INTEGER DEFAULT 0,
  successful_sessions INTEGER DEFAULT 0,
  total_pages_scraped INTEGER DEFAULT 0,
  total_training_records INTEGER DEFAULT 0,
  unique_domains INTEGER DEFAULT 0,
  average_session_duration INTERVAL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(date)
);

-- Domain performance metrics
CREATE TABLE domain_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain VARCHAR(255) NOT NULL,
  total_sessions INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2),
  average_pages_per_session DECIMAL(5,2),
  average_products_found DECIMAL(5,2),
  last_successful_scrape TIMESTAMP,
  error_count INTEGER DEFAULT 0,
  training_records_generated INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(domain)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Raw data indexes
CREATE INDEX idx_scraping_sessions_domain ON scraping_sessions(domain);
CREATE INDEX idx_scraping_sessions_status ON scraping_sessions(status);
CREATE INDEX idx_scraping_sessions_created_at ON scraping_sessions(created_at);

CREATE INDEX idx_raw_scrapes_session_id ON raw_scrapes(session_id);
CREATE INDEX idx_raw_scrapes_url_hash ON raw_scrapes(html_hash);
CREATE INDEX idx_raw_scrapes_page_type ON raw_scrapes(page_type);

CREATE INDEX idx_raw_interactions_session_id ON raw_interactions(session_id);
CREATE INDEX idx_raw_interactions_type ON raw_interactions(interaction_type);

CREATE INDEX idx_raw_price_data_product ON raw_price_data(product_identifier);
CREATE INDEX idx_raw_price_data_scraped_at ON raw_price_data(scraped_at);

-- Training data indexes
CREATE INDEX idx_training_components_type ON training_components(component_type);
CREATE INDEX idx_training_components_domain ON training_components(domain);
CREATE INDEX idx_training_components_validated ON training_components(validated);

CREATE INDEX idx_conversation_training_session ON conversation_training(session_id);
CREATE INDEX idx_conversation_training_validated ON conversation_training(validated);

CREATE INDEX idx_training_scenarios_type ON training_scenarios(scenario_type);
CREATE INDEX idx_training_scenarios_domain ON training_scenarios(domain);
CREATE INDEX idx_training_scenarios_tags ON training_scenarios USING GIN(tags);

-- Analytics indexes
CREATE INDEX idx_daily_stats_date ON daily_stats(date);
CREATE INDEX idx_domain_metrics_domain ON domain_metrics(domain);
CREATE INDEX idx_domain_metrics_success_rate ON domain_metrics(success_rate);

-- =====================================================
-- FUNCTIONS AND TRIGGERS
-- =====================================================

-- Update timestamps automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_scraping_sessions_updated_at BEFORE UPDATE ON scraping_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_processing_jobs_updated_at BEFORE UPDATE ON processing_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_domain_metrics_updated_at BEFORE UPDATE ON domain_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-update session statistics
CREATE OR REPLACE FUNCTION update_session_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE scraping_sessions 
    SET pages_scraped = (
        SELECT COUNT(*) FROM raw_scrapes WHERE session_id = NEW.session_id
    )
    WHERE id = NEW.session_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_session_stats_trigger AFTER INSERT ON raw_scrapes FOR EACH ROW EXECUTE FUNCTION update_session_stats();