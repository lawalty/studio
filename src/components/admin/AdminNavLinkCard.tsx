
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Crosshair } from 'lucide-react';

interface AdminNavLinkCardProps {
  title: string;
  description: string;
  href: string;
  Icon: LucideIcon;
}

export default function AdminNavLinkCard({ title, description, href, Icon }: AdminNavLinkCardProps) {
  return (
    <Card className="hover:shadow-lg transition-shadow duration-300 flex flex-col">
      <CardHeader className="pb-4">
        <div className="flex items-start gap-3 mb-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="font-headline text-lg">{title}</CardTitle>
            <CardDescription className="text-xs mt-1">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardFooter className="mt-auto pt-0">
        <Button asChild variant="ghost" size="sm" className="w-full group justify-start">
          <Link href={href}>
            Go to {title}
            <ArrowRight className="ml-auto h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
