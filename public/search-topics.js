const topics = {
  crisis: ["Crisis support", "suicide", "suicidal", "crisis", "self harm"],
  mental: ["Mental health & counselling", "mental health", "counselling", "counseling", "therapy", "anxiety", "depression", "mental wellness", "comit", "crest"],
  addictions: ["Addictions & substance use", "addiction", "gambling", "alcohol", "gaming", "substance abuse", "substance use", "drug abuse"],
  violence: ["Abuse, violence & trauma", "family violence", "domestic violence", "sexual violence", "sexual assault", "abuse", "trauma", "bullying"],
  financial: ["Financial, food & housing support", "financial assistance", "financial help", "financial aid", "debt", "food aid", "food assistance", "food bank", "food support", "housing", "homelessness", "shelter", "social service office", "sso"],
  family: ["Family, parenting & pregnancy", "family", "parenting", "pregnancy", "family service centre", "fsc", "marriage", "divorce", "childcare"],
  youth: ["Children & youth", "child", "children", "youth", "teen", "teens", "adolescent", "student", "crest youth"],
  seniors: ["Seniors & caregiving", "senior", "seniors", "eldercare", "elderly", "caregiver", "caregiving", "dementia", "ageing", "aging"],
  disability: ["Disability & neurodivergence", "disability", "disabilities", "autism", "autistic", "adhd", "neurodiversity", "neurodivergence", "special needs", "early intervention", "dyslexia"],
  healthcare: ["Healthcare", "healthcare", "health care", "medical", "hospital", "clinic", "rehabilitation", "palliative care", "hospice"],
  legal: ["Legal help", "legal", "legal aid", "legal clinic", "lawyer", "pro bono"],
  lgbtq: ["LGBTQ+ support", "lgbt", "lgbtq", "lgbtqia", "queer", "transgender", "gender identity"],
  migrant: ["Migrant worker support", "migrant", "migrant workers", "foreign worker", "foreign workers", "domestic worker", "domestic workers"],
  language: ["Language support", "mandarin", "chinese", "malay", "tamil", "hokkien", "cantonese", "bengali", "translation", "interpreter", "sign language"],
  unclassified: ["Unclassified"],
};

export const SEARCH_TOPIC_LABELS = Object.freeze(Object.fromEntries(
  Object.entries(topics).map(([key, [label]]) => [key, label]),
));

const matches = Object.entries(topics)
  .flatMap(([key, [, ...phrases]]) => phrases.map(phrase => ({ key, phrase })))
  .sort((first, second) => second.phrase.split(" ").length - first.phrase.split(" ").length || second.phrase.length - first.phrase.length);

export function classifySearchTopic(query) {
  const normalized = ` ${query.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
  return matches.find(({ phrase }) => normalized.includes(` ${phrase} `))?.key ?? "unclassified";
}
