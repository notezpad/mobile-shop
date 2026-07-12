import { Link } from 'react-router-dom';
import { Home, AlertCircle } from 'lucide-react';
import { Button, Card, CardContent } from '@components/ui';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="space-y-4 p-8">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-warning/10 text-warning">
            <AlertCircle className="size-8" />
          </div>
          <div className="space-y-1">
            <h1 className="text-4xl font-bold">404</h1>
            <p className="text-muted-foreground">الصفحة المطلوبة غير موجودة</p>
          </div>
          <Button asChild>
            <Link to="/dashboard">
              <Home className="size-4" />
              <span>العودة للرئيسية</span>
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
