-- industries
CREATE TABLE industries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT industries_name_unique UNIQUE (name)
);

-- users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100),
  email VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  phone VARCHAR(30),
  avatar_url TEXT,
  platform_role VARCHAR(30) NOT NULL DEFAULT 'user',
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  email_verified_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_platform_role_check CHECK (platform_role IN ('user', 'admin', 'support')),
  CONSTRAINT users_status_check CHECK (
    status IN ('active', 'inactive', 'suspended', 'pending')
  )
);

-- organizations
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  organization_type VARCHAR(30) NOT NULL,
  industry_id UUID REFERENCES industries(id) ON DELETE
  SET
    NULL,
    email VARCHAR(255),
    phone VARCHAR(30),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    postal_code VARCHAR(20),
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT organizations_type_check CHECK (
      organization_type IN (
        'consumer',
        'provider'
      )
    ),
    CONSTRAINT organizations_status_check CHECK (
      status IN (
        'active',
        'inactive',
        'pending',
        'suspended'
      )
    )
);

-- organization_memberships
CREATE TABLE organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL DEFAULT 'member',
  department VARCHAR(100),
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_membership_unique UNIQUE (user_id, organization_id),
  CONSTRAINT membership_role_check CHECK (
    role IN (
      'owner',
      'admin',
      'manager',
      'member',
      'technician',
      'billing'
    )
  ),
  CONSTRAINT membership_status_check CHECK (
    status IN (
      'active',
      'inactive',
      'invited'
    )
  )
);

CREATE INDEX idx_users_email ON users(email);

CREATE INDEX idx_users_status ON users(status);

CREATE INDEX idx_organizations_type ON organizations(organization_type);

CREATE INDEX idx_organizations_industry ON organizations(industry_id);

CREATE INDEX idx_memberships_user ON organization_memberships(user_id);

CREATE INDEX idx_memberships_organization ON organization_memberships(organization_id);

-- provider_profiles
CREATE TABLE provider_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  description TEXT,
  website_url TEXT,
  service_area TEXT,
  emergency_available BOOLEAN NOT NULL DEFAULT FALSE,
  response_time_hours INTEGER,
  verified_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT provider_profile_status_check CHECK (
    status IN (
      'pending',
      'approved',
      'rejected',
      'suspended'
    )
  ),
  CONSTRAINT provider_response_time_check CHECK (
    response_time_hours IS NULL
    OR response_time_hours >= 0
  )
);

-- Service categories
CREATE TABLE service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  description TEXT,
  industry_id UUID REFERENCES industries(id) ON DELETE
  SET
    NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT service_categories_name_unique UNIQUE (name)
);

-- provider_services
CREATE TABLE provider_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_category_id UUID REFERENCES service_categories(id) ON DELETE
  SET
    NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    base_price NUMERIC(12, 2),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT provider_service_price_check CHECK (
      base_price IS NULL
      OR base_price >= 0
    )
);

-- Assets / Equipment
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(150),
  manufacturer VARCHAR(150),
  model VARCHAR(150),
  serial_number VARCHAR(150),
  location TEXT,
  install_date DATE,
  warranty_expiry DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  last_maintenance_at TIMESTAMPTZ,
  next_maintenance_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT asset_status_check CHECK (
    status IN (
      'active',
      'inactive',
      'under_maintenance',
      'retired'
    )
  )
);

-- Service Requests
CREATE TABLE service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number VARCHAR(50) NOT NULL UNIQUE,
  consumer_organization_id UUID NOT NULL REFERENCES organizations(id),
  requested_by_user_id UUID NOT NULL REFERENCES users(id),
  provider_organization_id UUID REFERENCES organizations(id) ON DELETE
  SET
    NULL,
    asset_id UUID REFERENCES assets(id) ON DELETE
  SET
    NULL,
    service_category_id UUID REFERENCES service_categories(id) ON DELETE
  SET
    NULL,
    service_type VARCHAR(150),
    description TEXT NOT NULL,
    priority VARCHAR(30) NOT NULL DEFAULT 'normal',
    status VARCHAR(40) NOT NULL DEFAULT 'submitted',
    preferred_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT service_request_priority_check CHECK (
      priority IN (
        'low',
        'normal',
        'high',
        'urgent'
      )
    ),
    CONSTRAINT service_request_status_check CHECK (
      status IN (
        'draft',
        'submitted',
        'assigned',
        'quoted',
        'accepted',
        'in_progress',
        'completed',
        'cancelled',
        'rejected'
      )
    )
);

-- Quotes
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  provider_organization_id UUID NOT NULL REFERENCES organizations(id),
  submitted_by_user_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  estimated_days INTEGER,
  valid_until DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quote_status_check CHECK (
    status IN (
      'draft',
      'submitted',
      'accepted',
      'rejected',
      'expired',
      'cancelled'
    )
  ),
  CONSTRAINT quote_amounts_check CHECK (
    subtotal >= 0
    AND tax_amount >= 0
    AND total_amount >= 0
  )
);

CREATE TABLE quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  description VARCHAR(255) NOT NULL,
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 2) NOT NULL,
  line_total NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quote_item_quantity_check CHECK (quantity > 0),
  CONSTRAINT quote_item_price_check CHECK (unit_price >= 0),
  CONSTRAINT quote_item_total_check CHECK (line_total >= 0)
);

-- Contracts
CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number VARCHAR(50) NOT NULL UNIQUE,
  service_request_id UUID REFERENCES service_requests(id),
  quote_id UUID REFERENCES quotes(id),
  consumer_organization_id UUID NOT NULL REFERENCES organizations(id),
  provider_organization_id UUID NOT NULL REFERENCES organizations(id),
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  terms TEXT,
  start_date DATE,
  end_date DATE,
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contract_status_check CHECK (
    status IN (
      'draft',
      'sent',
      'accepted',
      'rejected',
      'expired',
      'active',
      'completed',
      'cancelled'
    )
  ),
  CONSTRAINT contract_amount_check CHECK (total_amount >= 0)
);

-- Work Orders
CREATE TABLE work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_number VARCHAR(50) NOT NULL UNIQUE,
  service_request_id UUID NOT NULL REFERENCES service_requests(id),
  asset_id UUID REFERENCES assets(id) ON DELETE
  SET
    NULL,
    provider_organization_id UUID NOT NULL REFERENCES organizations(id),
    assigned_to_user_id UUID REFERENCES users(id) ON DELETE
  SET
    NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    priority VARCHAR(30) NOT NULL DEFAULT 'normal',
    scheduled_start_at TIMESTAMPTZ,
    scheduled_end_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    estimated_cost NUMERIC(12, 2),
    actual_cost NUMERIC(12, 2),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT work_order_status_check CHECK (
      status IN (
        'pending',
        'scheduled',
        'in_progress',
        'completed',
        'cancelled'
      )
    ),
    CONSTRAINT work_order_priority_check CHECK (
      priority IN (
        'low',
        'normal',
        'high',
        'urgent'
      )
    )
);

-- Work Order History
CREATE TABLE work_order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE
  SET
    NULL,
    old_status VARCHAR(30),
    new_status VARCHAR(30),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  service_request_id UUID REFERENCES service_requests(id),
  work_order_id UUID REFERENCES work_orders(id),
  contract_id UUID REFERENCES contracts(id),
  consumer_organization_id UUID NOT NULL REFERENCES organizations(id),
  provider_organization_id UUID NOT NULL REFERENCES organizations(id),
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  issued_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoice_status_check CHECK (
    status IN (
      'draft',
      'issued',
      'partially_paid',
      'paid',
      'overdue',
      'cancelled'
    )
  ),
  CONSTRAINT invoice_amount_check CHECK (
    subtotal >= 0
    AND tax_amount >= 0
    AND total_amount >= 0
  )
);

CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description VARCHAR(255) NOT NULL,
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 2) NOT NULL,
  line_total NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoice_item_quantity_check CHECK (quantity > 0),
  CONSTRAINT invoice_item_price_check CHECK (unit_price >= 0),
  CONSTRAINT invoice_item_total_check CHECK (line_total >= 0)
);

-- Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  method VARCHAR(30),
  reference VARCHAR(150),
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_amount_check CHECK (amount > 0),
  CONSTRAINT payment_status_check CHECK (
    status IN (
      'pending',
      'completed',
      'failed',
      'refunded'
    )
  )
);

-- Maintenance Plans
CREATE TABLE maintenance_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  provider_organization_id UUID NOT NULL REFERENCES organizations(id),
  frequency VARCHAR(50) NOT NULL,
  next_due_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  related_entity_type VARCHAR(50),
  related_entity_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number VARCHAR(50) NOT NULL UNIQUE,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  assigned_to_user_id UUID REFERENCES users(id) ON DELETE
  SET
    NULL,
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100),
    priority VARCHAR(30) NOT NULL DEFAULT 'normal',
    status VARCHAR(30) NOT NULL DEFAULT 'open',
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT support_ticket_priority_check CHECK (
      priority IN (
        'low',
        'normal',
        'high',
        'urgent'
      )
    ),
    CONSTRAINT support_ticket_status_check CHECK (
      status IN (
        'open',
        'in_progress',
        'resolved',
        'closed'
      )
    )
);

CREATE TABLE ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Service Request Messages
CREATE TABLE service_request_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reviews
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id UUID NOT NULL REFERENCES service_requests(id),
  consumer_organization_id UUID NOT NULL REFERENCES organizations(id),
  provider_organization_id UUID NOT NULL REFERENCES organizations(id),
  reviewer_user_id UUID NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT review_rating_check CHECK (
    rating BETWEEN 1
    AND 5
  ),
  CONSTRAINT review_one_per_request UNIQUE (service_request_id)
);

-- Attachments
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by_user_id UUID NOT NULL REFERENCES users(id),
  service_request_id UUID REFERENCES service_requests(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100),
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);