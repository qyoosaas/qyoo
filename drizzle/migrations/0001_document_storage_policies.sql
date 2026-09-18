CREATE POLICY "Authenticated users read documents bucket"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents');
CREATE POLICY "Authenticated users upload to documents bucket"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents');
CREATE POLICY "Authenticated users update documents bucket"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documents');
CREATE POLICY "Authenticated users delete documents bucket"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents');
