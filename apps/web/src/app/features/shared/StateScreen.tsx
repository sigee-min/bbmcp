import { LoaderCircle } from 'lucide-react';

import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';

interface StateScreenProps {
  title: string;
  description: string;
  destructive?: boolean;
  loading?: boolean;
  actionLabel?: string;
  actionVariant?: 'default' | 'secondary';
  onAction?: () => void;
}

export function StateScreen({
  title,
  description,
  destructive = false,
  loading = false,
  actionLabel,
  actionVariant = 'default',
  onAction
}: StateScreenProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4">
      <Card className={destructive ? 'w-full border-destructive/40 bg-card/90' : 'w-full border-border/60 bg-card/90'}>
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-2xl">
            <img
              alt="Ashfox"
              src="/favicon-32x32.png"
              width={32}
              height={32}
              className="h-8 w-8 rounded-sm border border-border/70 bg-background/80 object-contain"
            />
            <span>{title}</span>
            {loading ? <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" /> : null}
          </CardTitle>
          <CardDescription className={destructive ? 'text-destructive' : undefined}>{description}</CardDescription>
        </CardHeader>
        {actionLabel && onAction ? (
          <CardContent>
            <Button onClick={onAction} variant={actionVariant}>
              {actionLabel}
            </Button>
          </CardContent>
        ) : null}
      </Card>
    </main>
  );
}
