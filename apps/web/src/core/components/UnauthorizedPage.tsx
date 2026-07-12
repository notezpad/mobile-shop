import { Link } from 'react-router-dom';
import { ShieldX, Home } from 'lucide-react';
import { Button, Card, CardContent } from '@components/ui';

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="space-y-4 p-8">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldX className="size-8" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">غير مصرح</h1>
            <p className="text-muted-foreground">لا تملك صلاحية الوصول إلى هذه الصفحة</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/dashboard">
              <Home className="size-4" />
              <span>العودة للوحة التحكم</span>
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
