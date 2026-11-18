/**
 * Ikony projektů a úkolů – jen vybrané ikony Lucide (jednotlivé importy → tree-shaking).
 * V dokumentu se ukládá klíč (např. "server"); klíče se nesmí měnit.
 */
import {
  Ambulance,
  BatteryFull,
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
  Headphones,
  Headset,
  Hospital,
  Keyboard,
  Laptop,
  Lightbulb,
  MapPin,
  Megaphone,
  Mic,
  Monitor,
  Mouse,
  Network,
  Phone,
  Printer,
  Radio,
  RadioReceiver,
  RadioTower,
  Route,
  Router,
  SatelliteDish,
  Server,
  Shield,
  ShieldCheck,
  Signpost,
  Siren,
  Smartphone,
  Speaker,
  Tablet,
  Target,
  Ticket,
  TrafficCone,
  TrainFront,
  TrainFrontTunnel,
  TrainTrack,
  TramFront,
  Usb,
  Users,
  Webcam,
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
      { key: 'wifi', label: 'Wi-Fi', Icon: Wifi },
      { key: 'cloud', label: 'Cloud', Icon: Cloud },
      { key: 'code', label: 'Vývoj', Icon: Code },
      { key: 'security', label: 'Zabezpečení', Icon: ShieldCheck },
    ],
  },
  {
    name: 'Hardware',
    icons: [
      { key: 'headset', label: 'Headset', Icon: Headset },
      { key: 'headphones', label: 'Sluchátka', Icon: Headphones },
      { key: 'mic', label: 'Mikrofon', Icon: Mic },
      { key: 'tablet', label: 'Tablet', Icon: Tablet },
      { key: 'smartphone', label: 'Mobilní telefon', Icon: Smartphone },
      { key: 'radiostation', label: 'Radiostanice', Icon: RadioReceiver },
      { key: 'antenna', label: 'Anténa / vysílač', Icon: RadioTower },
      { key: 'satellite', label: 'Satelitní anténa', Icon: SatelliteDish },
      { key: 'router', label: 'Router', Icon: Router },
      { key: 'monitor', label: 'Monitor', Icon: Monitor },
      { key: 'laptop', label: 'Notebook', Icon: Laptop },
      { key: 'keyboard', label: 'Klávesnice', Icon: Keyboard },
      { key: 'mouse', label: 'Myš', Icon: Mouse },
      { key: 'webcam', label: 'Webkamera', Icon: Webcam },
      { key: 'printer', label: 'Tiskárna', Icon: Printer },
      { key: 'speaker', label: 'Reproduktor', Icon: Speaker },
      { key: 'battery', label: 'Baterie', Icon: BatteryFull },
      { key: 'usb', label: 'USB / kabel', Icon: Usb },
      { key: 'harddrive', label: 'Disk', Icon: HardDrive },
      { key: 'cpu', label: 'Procesor', Icon: Cpu },
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

/** Bez diakritiky a malými písmeny – pro vyhledávání. */
export { foldText } from '../../model/text';
import { foldText } from '../../model/text';

/** Skupiny ikon filtrované podle dotazu (popisek nebo název skupiny, bez ohledu na diakritiku). */
export function filterIconGroups(query: string): IconGroup[] {
  const q = foldText(query);
  if (!q) return ICON_GROUPS;
  return ICON_GROUPS.map((g) => ({
    name: g.name,
    icons: foldText(g.name).includes(q) ? g.icons : g.icons.filter((i) => foldText(i.label).includes(q)),
  })).filter((g) => g.icons.length > 0);
}
