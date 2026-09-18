-- Universal document ingestion layer
CREATE TABLE public.document_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text,
  size_kb integer NOT NULL DEFAULT 0,
  storage_path text,
  source text NOT NULL DEFAULT 'upload',
  processor text,
  processor_version text,
  doc_type text NOT NULL DEFAULT 'unknown',
  doc_type_confidence numeric NOT NULL DEFAULT 0,
  doc_type_source text NOT NULL DEFAULT 'auto',
  status text NOT NULL DEFAULT 'uploading',
  overall_confidence numeric NOT NULL DEFAULT 0,
  original_extraction jsonb,
  field_confidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_corrected_data jsonb,
  final_posted_data jsonb,
  validation jsonb NOT NULL DEFAULT '[]'::jsonb,
  matches jsonb NOT NULL DEFAULT '{}'::jsonb,
  duplicate_of uuid REFERENCES public.document_uploads(id),
  linked_entity_type text,
  linked_entity_id uuid,
  linked_entity_label text,
  exception_id uuid REFERENCES public.exceptions(id),
  error_message text,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  approved_at timestamptz
);

CREATE INDEX idx_document_uploads_company ON public.document_uploads(company_id, created_at DESC);
CREATE INDEX idx_document_uploads_status ON public.document_uploads(company_id, status);
CREATE INDEX idx_document_uploads_type ON public.document_uploads(company_id, doc_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_uploads TO authenticated;
GRANT ALL ON public.document_uploads TO service_role;
ALTER TABLE public.document_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage document uploads"
  ON public.document_uploads FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.document_upload_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_upload_id uuid NOT NULL REFERENCES public.document_uploads(id) ON DELETE CASCADE,
  stage text NOT NULL,
  detail text,
  payload jsonb,
  actor text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_upload_events_doc ON public.document_upload_events(document_upload_id, created_at);

GRANT SELECT, INSERT ON public.document_upload_events TO authenticated;
GRANT ALL ON public.document_upload_events TO service_role;
ALTER TABLE public.document_upload_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage document upload events"
  ON public.document_upload_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
