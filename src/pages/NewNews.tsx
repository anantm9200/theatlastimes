import { useNavigate } from "react-router-dom";
import ArticleForm from "../components/ArticleForm";
import EditorialGate from "../components/EditorialGate";

export default function NewNews() {
  const navigate = useNavigate();
  return <EditorialGate><div className="max-w-4xl mx-auto py-12 px-4 space-y-7">
    <h1 className="font-serif text-4xl font-bold">Create a report</h1>
    <p className="text-muted-foreground">Start with a draft, add source attribution, and review before publishing.</p>
    <ArticleForm onSaved={(article, message, job) => navigate(`/article/${encodeURIComponent(article.id)}/edit`, { state: { message, job } })} />
  </div></EditorialGate>;
}
