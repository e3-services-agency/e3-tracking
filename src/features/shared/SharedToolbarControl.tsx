import { Button, type ButtonProps } from '@/src/components/ui/Button';
/** One size and treatment for shared header/section actions; asChild preserves native links. */
export function SharedToolbarControl(props: Omit<ButtonProps, 'variant' | 'size' | 'className'>) {
  return <Button variant="outline" size="default" {...props} />;
}
