
'use client';

import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Languages } from 'lucide-react';

export default function LanguageSelector() {
  const { language, setLanguage } = useLanguage();

  const handleValueChange = (value: 'English' | 'Spanish') => {
    setLanguage(value);
  };

  return (
    <div className="flex items-center gap-2">
       <Languages className="h-5 w-5 text-muted-foreground" />
      <Select onValueChange={handleValueChange} defaultValue={language}>
        <SelectTrigger className="w-[120px] border-0 focus:ring-0">
          <SelectValue placeholder="Language" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="English">English</SelectItem>
          <SelectItem value="Spanish">Spanish</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
