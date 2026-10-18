import { useState } from "react";
import { Link } from "react-router-dom";
import SeoHead from "../lib/SeoHead";

const regions = ["Global", "North America", "Europe", "Asia", "Middle East", "Africa", "Latin America"];
const categories = ["World", "Politics", "Business", "Technology", "Science", "Climate", "Health", "Sports", "Culture"];
function loadPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem("atlas-reader-preferences") || "{}");
    return { regions: Array.isArray(value.regions) ? value.regions.filter((item: unknown) => typeof item === "string" && regions.includes(item)) : ["Global"], categories: Array.isArray(value.categories) ? value.categories.filter((item: unknown) => typeof item === "string" && categories.includes(item)) : [] };
  } catch { return { regions: ["Global"], categories: [] }; }
}

export default function Preferences() {
  const [selected, setSelected] = useState(loadPreferences);
  const [message, setMessage] = useState("");
  const toggle = (group: "regions" | "categories", item: string) => {
    setSelected(current => ({ ...current, [group]: current[group].includes(item) ? current[group].filter((value: string) => value !== item) : [...current[group], item] }));
    setMessage("");
  };
  return <div className="max-w-3xl mx-auto py-12 px-4 space-y-8">
    <SeoHead title="Reader preferences" noindex />
    <h1 className="text-4xl font-serif font-bold">Reader preferences</h1>
    <p className="text-muted-foreground">Save your interests in this browser and use the links below to browse them. Your preferences and saved reports stay on this device.</p>
    {(["regions", "categories"] as const).map(group => <fieldset key={group} className="space-y-4">
      <legend className="text-xl font-serif font-bold mb-4">{group === "regions" ? "Regions" : "Subjects"}</legend>
      <div className="flex flex-wrap gap-3">{(group === "regions" ? regions : categories).map(item => <button key={item} type="button" aria-pressed={selected[group].includes(item)} onClick={() => toggle(group, item)} className={`border px-4 py-2 ${selected[group].includes(item) ? "bg-foreground text-background" : "bg-background"}`}>{item}</button>)}</div>
    </fieldset>)}
    <button className="bg-primary text-primary-foreground px-6 py-3 font-bold" onClick={() => {
      try { localStorage.setItem("atlas-reader-preferences", JSON.stringify(selected)); setMessage("Preferences saved on this device."); }
      catch { setMessage("This browser could not save your preferences. Allow site storage and try again."); }
    }}>Save preferences</button>
    <p role="status">{message}</p>
    {(selected.categories.length > 0 || selected.regions.length > 0) && <nav aria-label="Your selected sections" className="border-t border-border pt-6 flex flex-wrap gap-5">
      {selected.categories.map((item: string) => <Link key={item} className="underline" to={`/category/${encodeURIComponent(item.toLowerCase())}`}>{item}</Link>)}
      {selected.regions.map((item: string) => <Link key={item} className="underline" to={`/region/${encodeURIComponent(item.toLowerCase().replace(/ /g, "-"))}`}>{item}</Link>)}
    </nav>}
  </div>;
}
