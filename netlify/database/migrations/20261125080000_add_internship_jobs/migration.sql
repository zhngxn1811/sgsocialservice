WITH listings (id, title, org, org_type, location, salary_min, salary_max, summary,
  requirements, qualification, fresh_grad, nature, posted_at, url) AS (
  VALUES
    ('social-work-intern-family-development-sinda', 'Social Work Intern – Family Development Division',
      'Singapore Indian Development Association (SINDA)', 'social-community', 'Central, Singapore',
      NULL::integer, NULL::integer,
      'Over 3–6 months, support social workers with enquiries, data collection and follow-ups, accompany them on home visits and client appointments, and help run programmes.',
      'Currently pursuing a diploma or degree in Social Work or a related field. Must be available for some weekday evenings and Saturdays.',
      'diploma', false, ARRAY['social-work', 'community-programmes'], DATE '2026-08-19',
      'https://www.sinda.org.sg/career/social-work-intern-family-development-division/'),
    ('trust-services-intern-sg-enable', 'Intern, Trust Services',
      'SG Enable', 'government', 'Enabling Village, Central, Singapore', 800, 1300,
      'Support future care planning and case management with families of persons with disabilities, including Special Needs Trust applications and home visits.',
      'Currently pursuing or recently completed a degree or graduate diploma in Social Work. Available from January 2027 for at least three months.',
      'bachelors', true, ARRAY['social-work', 'special-needs', 'case-management'], DATE '2026-11-03',
      'https://sg.indeed.com/viewjob?jk=5bd147f166e7bc4e'),
    ('social-service-intern-maintenance-support-central-scwo', 'Social Service Intern (Maintenance Support Central)',
      'Singapore Council of Women''s Organisations', 'charity', 'Bugis, Central, Singapore', 600, 600,
      'Handle enquiries, provide basic emotional support, carry out intake assessments and help clients with maintenance order applications. Training is provided.',
      'Final-year diploma or undergraduate students and fresh graduates in counselling, social work, psychology or a related field may apply.',
      'diploma', true, ARRAY['social-work', 'counselling'], DATE '2026-11-03',
      'https://sg.indeed.com/viewjob?jk=5e86ad2874287f8e'),
    ('wellness-programme-intern-total-wellness-initiative-singapore', 'Wellness Project Intern (Wellness Programme)',
      'Total Wellness Initiative Singapore', 'social-community', 'Yishun, North, Singapore', 800, 800,
      'Co-facilitate mental health programmes for youths aged 13–25, help recruit and support volunteers, and create wellness content.',
      'Available full-time from February 2027 for at least six months. No specific academic qualification is stated.',
      'unspecified', false, ARRAY['community-programmes', 'youth-work'], DATE '2026-11-02',
      'https://sg.indeed.com/viewjob?jk=173878ff1aeec279')
)
INSERT INTO jobs (id, source, source_id, source_name, title, org, org_type, location, employment_type,
  salary_min, salary_max, salary_type, summary, description, requirements, qualification, fresh_grad,
  nature, posted_at, closes_at, closing_date_estimated, apply_url, source_url, curated)
SELECT id, 'manual', id, CASE WHEN id = 'social-work-intern-family-development-sinda' THEN 'SINDA' ELSE 'Indeed' END,
  title, org, org_type, location, 'Internship', salary_min, salary_max,
  CASE WHEN salary_min IS NOT NULL THEN 'Monthly' ELSE '' END,
  summary, summary, requirements, qualification, fresh_grad, nature, posted_at,
  DATE '2026-12-25', true, url, url, true
FROM listings
ON CONFLICT DO NOTHING;
