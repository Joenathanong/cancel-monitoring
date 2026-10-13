'use client';
import { CheckCheck, XCircle, Clock, HelpCircle, PackageX, Tag, Truck, FileCheck2, FileX2, Ban, PackageCheck, PackageMinus, AlertTriangle, Lock } from 'lucide-react';
import { Chip, type Tone } from '@/components/ui/primitives';
import { RESOLUTION_LABEL, statusName, type Resolution } from '@/lib/ocs-status';
import { CANCEL_BUCKET_LABEL, type CancelBucket } from '@/lib/kpi';
import { PO_LABEL, ARRIVAL_LABEL } from '@/lib/items';

const RES_TONE: Record<Resolution, Tone> = { OPEN: 'critical', PROCESSED: 'positive', CANCELLED: 'negative' };
const RES_ICON: Record<Resolution, React.ReactNode> = { OPEN: <Clock />, PROCESSED: <CheckCheck />, CANCELLED: <XCircle /> };

export function ResolutionChip({ resolution, manual }: { resolution: Resolution; manual?: boolean }) {
  return (
    <Chip tone={RES_TONE[resolution]} icon={manual ? <Lock /> : RES_ICON[resolution]} title={manual ? 'Ditetapkan manual oleh Admin' : undefined}>
      {RESOLUTION_LABEL[resolution]}
    </Chip>
  );
}

export function OcsChip({ code, name, found, error }: { code: number | null; name: string | null; found: boolean | null; error?: string | null }) {
  if (found === false) return <Chip tone="neutral" icon={<HelpCircle />} title="Order ID tidak ditemukan lewat Find Order OCS">Tidak ada di OCS</Chip>;
  if (code === null) return error ? <Chip tone="negative" icon={<AlertTriangle />} title={error}>Gagal cek</Chip> : <Chip tone="neutral" icon={<Clock />}>Belum dicek</Chip>;
  const tone: Tone = code === 90000 || code === 11100 ? 'negative' : code === 11000 ? 'critical' : code >= 20030 ? 'positive' : 'informative';
  return <Chip tone={tone} icon={<Truck />} title={`Kode ${code}`}>{name ?? statusName(code)}</Chip>;
}

export function BucketChip({ bucket }: { bucket: CancelBucket | null }) {
  if (!bucket) return null;
  return <Chip tone={bucket === 'LE1' ? 'neutral' : bucket === 'D2' ? 'critical' : 'negative'}>{CANCEL_BUCKET_LABEL[bucket]}</Chip>;
}

export function CategoryChips({ isPhaseOut, isClearance, info }: { isPhaseOut: boolean; isClearance: boolean; info?: string | null }) {
  if (!isPhaseOut && !isClearance) return null;
  return (
    <span className="inline-flex gap-1 flex-wrap font-sans">
      {isPhaseOut && <Chip tone="negative" icon={<PackageX />} title={info ?? 'Phase Out (doi-monitor)'}>Phase Out</Chip>}
      {isClearance && <Chip tone="critical" icon={<Tag />} title="Kode CS- (Clearance Sale)">Clearance</Chip>}
    </span>
  );
}

export function PoChip({ status }: { status: 'BELUM' | 'SUDAH' | 'TIDAK_PERLU' }) {
  const tone: Tone = status === 'SUDAH' ? 'informative' : status === 'TIDAK_PERLU' ? 'neutral' : 'critical';
  const icon = status === 'SUDAH' ? <FileCheck2 /> : status === 'TIDAK_PERLU' ? <Ban /> : <FileX2 />;
  return <Chip tone={tone} icon={icon}>{PO_LABEL[status]}</Chip>;
}

export function ArrivalChip({ status }: { status: 'BELUM' | 'SEBAGIAN' | 'SUDAH' }) {
  const tone: Tone = status === 'SUDAH' ? 'positive' : status === 'SEBAGIAN' ? 'critical' : 'neutral';
  const icon = status === 'SUDAH' ? <PackageCheck /> : status === 'SEBAGIAN' ? <PackageMinus /> : <Clock />;
  return <Chip tone={tone} icon={icon}>{ARRIVAL_LABEL[status]}</Chip>;
}
