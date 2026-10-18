import { useEffect, useState } from "react";
import { editorialRequest } from "../lib/editorialApi";
interface PublisherSetting { _id: string; name: string; imagesEnabled: boolean; imagePermission: string; imageHosts: string[]; enabled: boolean }
export default function PublisherSettings() {
  const [publishers, setPublishers] = useState<PublisherSetting[]>([]), [error, setError] = useState("");
  const [schedule, setSchedule] = useState<{ dailyAt: string; timeZone: string; enabled: boolean; autoPublish: boolean }>();
  useEffect(() => {
    Promise.all([editorialRequest<{ data: PublisherSetting[] }>("/api/admin/publishers"), editorialRequest<any>("/api/admin/ingestion")]).then(([sources, daily]) => { setPublishers(sources.data); setSchedule(daily); }).catch(error => setError(error.message));
  }, []);
  async function toggle(publisher: PublisherSetting) {
    try {
      await editorialRequest(`/api/admin/publishers/${publisher._id}/images`, { method: "PUT", body: JSON.stringify({ enabled: !publisher.imagesEnabled }) });
      setPublishers(values => values.map(value => value._id === publisher._id ? { ...value, imagesEnabled: !value.imagesEnabled } : value)); setError("");
    } catch (error) { setError((error as Error).message); }
  }
  return <details className="border border-border p-5 space-y-4">
    <summary className="font-bold cursor-pointer">Daily news and publisher photos</summary>
    {schedule && <p className="text-sm">Daily collection: {schedule.enabled ? `${schedule.dailyAt} (${schedule.timeZone}) on DGX` : "disabled"}. Automatic publication: {schedule.autoPublish ? "enabled after source and global-news checks" : "disabled"}.</p>}
    <p className="text-sm text-muted-foreground">Free licensed images are considered first. Disable a publisher here to stop showing its photos on subsequent page reads. Enabling photos requires recorded permission and approved image hosts.</p>
    {publishers.map(publisher => <label key={publisher._id} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={publisher.imagesEnabled} onChange={() => void toggle(publisher)} disabled={!publisher.imagesEnabled && (!publisher.imagePermission || !publisher.imageHosts.length)} />{publisher.name} photos {(!publisher.imagePermission || !publisher.imageHosts.length) && <span className="text-muted-foreground">— permission not recorded</span>}</label>)}
    {error && <p role="alert">{error}</p>}
  </details>;
}
