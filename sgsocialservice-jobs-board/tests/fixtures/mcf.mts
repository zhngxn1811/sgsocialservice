import type { McfJob } from '../../netlify/lib/jobs.mts';

// Shaped like a real result from GET https://api.mycareersfuture.gov.sg/v2/jobs (Nov 2026)
export const mcf = (over: Partial<McfJob> = {}): McfJob => ({
  uuid: '232da04726ad9548e5bef220dd8ff19e',
  title: 'Social Worker - Social Housing (Rental Housing Projects)',
  description: '<h3>Job Summary </h3><p>The Social Worker &ndash; Social Housing supports residents &amp; families.</p><ul><li>Conduct assessments and case management</li><li>Run group work programmes</li></ul><h3>Requirements:</h3><ul><li>Degree in Social Work, recognised by SASW</li><li>Master&#39;s in Social Work is an advantage</li><li>At least 2 years of experience in casework</li></ul><script>alert(1)</script>',
  minimumYearsExperience: 2,
  ssecEqa: '70',
  otherRequirements: null,
  skills: [{ skill: 'Communication' }, { skill: 'Needs Assessment' }, { skill: 'Client Management' }],
  categories: [{ category: 'Social Services' }],
  employmentTypes: [{ employmentType: 'Full Time' }],
  positionLevels: [{ position: 'Executive' }],
  status: { jobStatus: 'Open' },
  postedCompany: { name: 'NEW HOPE COMMUNITY SERVICES LIMITED', uen: '202525069Z', ssicDescription2020: 'OTHER RESIDENTIAL CARE SERVICES N.E.C.' },
  hiringCompany: null,
  address: { isOverseas: false, overseasCountry: null, districts: [{ location: 'Islandwide', region: 'Islandwide' }] },
  metadata: { jobPostId: 'MCF-2026-2075756', newPostingDate: '2026-11-19', originalPostingDate: '2026-11-19', expiryDate: '2026-12-19', jobDetailsUrl: 'https://www.mycareersfuture.gov.sg/job/social-services/social-worker-social-housing-new-hope-232da04726ad9548e5bef220dd8ff19e', isHideSalary: false },
  salary: { minimum: 4000, maximum: 5000, type: { salaryType: 'Monthly' } },
  ...over,
});
