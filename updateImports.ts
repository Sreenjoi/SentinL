import fs from 'fs';

let content = fs.readFileSync('src/components/Settings.tsx', 'utf8');

if (!content.includes('Wand2')) {
  content = content.replace('} from "lucide-react";', '  Wand2,\n} from "lucide-react";');
}
if (!content.includes('Brain,')) {
  content = content.replace('} from "lucide-react";', '  Brain,\n} from "lucide-react";');
}
if (!content.includes('Lock,')) {
  content = content.replace('} from "lucide-react";', '  Lock,\n} from "lucide-react";');
}
if (!content.includes('X,')) {
  content = content.replace('} from "lucide-react";', '  X,\n} from "lucide-react";');
}
if (!content.includes('Gavel,')) {
  content = content.replace('} from "lucide-react";', '  Gavel,\n} from "lucide-react";');
}

fs.writeFileSync('src/components/Settings.tsx', content);
