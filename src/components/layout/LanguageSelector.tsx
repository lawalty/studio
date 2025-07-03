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
    <div className="flex items-center gap-1">
       <Languages className="h-4 w-4 text-muted-foreground" />
      <Select onValueChange={handleValueChange} defaultValue={language}>
        <SelectTrigger className="w-auto h-auto px-2 py-1 text-xs border-0 focus:ring-0 bg-transparent shadow-none">
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
