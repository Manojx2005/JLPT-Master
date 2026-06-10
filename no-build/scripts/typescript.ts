// TypeScript Interfaces for the AI
interface MockTest {
  test_id: string;
  title: string;
  time_limit_minutes: number;
  total_score: number;
  sections: TestSection[];
}

interface TestSection {
  section_id: string; // e.g., "問題1"
  instruction: string; // e.g., "＿＿＿の言葉の読み方として最もよいものを..."
  points_per_question: number;
  question_type: "multiple_choice" | "grammar_ordering" | "reading_comprehension";
  passage?: string; // Only used for reading comprehension sections
  questions: Question[];
}

interface Question {
  question_id: number;
  text: string; // The question text. Use [ ] to denote underlines or blanks.
  options: Option[];
}

interface Option {
  id: number; // 1, 2, 3, or 4
  text: string;
}