/**
 * Ikony projektů – jen vybrané ikony Lucide (jednotlivé importy → tree-shaking).
 * V dokumentu se ukládá klíč (např. "server").
 */
import {
  Ambulance,
  Briefcase,
  Building2,
  Calendar,
  ChartColumn,
  ClipboardList,
  Cloud,
  Code,
  Construction,
  Cpu,
  Database,
  FileText,
  FireExtinguisher,
  Flag,
  Flame,
  Handshake,
  HardDrive,
  HeartPulse,
  Hospital,
  Laptop,
  Lightbulb,
  MapPin,
  Megaphone,
  Network,
  Phone,
  Radio,
  Route,
  Server,
  Shield,
  ShieldCheck,
  Signpost,
  Siren,
  Target,
  Ticket,
  TrafficCone,
  TrainFront,
  TrainFrontTunnel,
  TrainTrack,
  TramFront,
  Users,
  Wifi,
  type LucideIcon,
} from 'lucide-react';

export interface ProjectIcon {
  key: string;
  label: string;
  Icon: LucideIcon;
}

export interface IconGroup {
  name: string;
  icons: ProjectIcon[];
}

export const ICON_GROUPS: IconGroup[] = [
  {
    name: 'IT',
    icons: [
      { key: 'server', label: 'Server', Icon: Server },
      { key: 'database', label: 'Databáze', Icon: Database },
      { key: 'network', label: 'Síť', Icon: Network },
      { key: 'laptop', label: 'Notebook', Icon: Laptop },
      { key: 'cpu', label: 'Procesor', Icon: Cpu },
      { key: 'harddrive', label: 'Disk', Icon: HardDrive },
      { key: 'wifi', label: 'Wi-Fi', Icon: Wifi },
      { key: 'cloud', label: 'Cloud', Icon: Cloud },
      { key: 'code', label: 'Vývoj', Icon: Code },
      { key: 'security', label: 'Zabezpečení', Icon: ShieldCheck },
    ],
  },
  {
    name: 'Železnice',
    icons: [
      { key: 'train', label: 'Vlak', Icon: TrainFront },
      { key: 'tunnel', label: 'Tunel', Icon: TrainFrontTunnel },
      { key: 'track', label: 'Koleje', Icon: TrainTrack },
      { key: 'tram', label: 'Tramvaj', Icon: TramFront },
      { key: 'station', label: 'Nádraží', Icon: Building2 },
      { key: 'signpost', label: 'Návěstí', Icon: Signpost },
      { key: 'route', label: 'Trasa', Icon: Route },
      { key: 'construction', label: 'Výluka', Icon: Construction },
      { key: 'ticket', label: 'Jízdenka', Icon: Ticket },
    ],
  },
  {
    name: 'IZS',
    icons: [
      { key: 'ambulance', label: 'Sanitka', Icon: Ambulance },
      { key: 'police', label: 'Policie', Icon: Shield },
      { key: 'fire', label: 'Hasiči', Icon: Flame },
      { key: 'extinguisher', label: 'Hasicí přístroj', Icon: FireExtinguisher },
      { key: 'siren', label: 'Majáček', Icon: Siren },
      { key: 'health', label: 'Zdraví', Icon: HeartPulse },
      { key: 'hospital', label: 'Nemocnice', Icon: Hospital },
      { key: 'radio', label: 'Vysílačka', Icon: Radio },
      { key: 'phone', label: 'Tísňová linka', Icon: Phone },
      { key: 'cone', label: 'Uzavírka', Icon: TrafficCone },
      { key: 'location', label: 'Místo zásahu', Icon: MapPin },
    ],
  },
  {
    name: 'Management',
    icons: [
      { key: 'calendar', label: 'Kalendář', Icon: Calendar },
      { key: 'chart', label: 'Graf', Icon: ChartColumn },
      { key: 'team', label: 'Tým', Icon: Users },
      { key: 'target', label: 'Cíl', Icon: Target },
      { key: 'document', label: 'Dokument', Icon: FileText },
      { key: 'briefcase', label: 'Obchod', Icon: Briefcase },
      { key: 'checklist', label: 'Plán', Icon: ClipboardList },
      { key: 'flag', label: 'Milník', Icon: Flag },
      { key: 'idea', label: 'Nápad', Icon: Lightbulb },
      { key: 'partner', label: 'Partner', Icon: Handshake },
      { key: 'announce', label: 'Komunikace', Icon: Megaphone },
    ],
  },
];

const BY_KEY = new Map(ICON_GROUPS.flatMap((g) => g.icons).map((i) => [i.key, i]));

export function projectIcon(key: string | undefined): ProjectIcon | undefined {
  return key ? BY_KEY.get(key) : undefined;
}
