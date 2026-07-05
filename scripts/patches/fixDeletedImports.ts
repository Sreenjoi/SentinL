import fs from 'fs';
const lines = fs.readFileSync('src/components/Settings.tsx', 'utf8').split('\n');
const missingImports = \`import { EmptyState, CompactEmptyState } from "./EmptyState";
import { useLocation, useNavigate } from "react-router-dom";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { useAuthState } from "react-firebase-hooks/auth";\`;

lines.splice(1, 0, missingImports);
fs.writeFileSync('src/components/Settings.tsx', lines.join('\n'));
