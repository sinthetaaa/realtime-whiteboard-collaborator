import {
  redirect,
} from 'next/navigation';


export default function NewPage() {
  /*
   * Board creation is a POST mutation from the
   * homepage. This compatibility route performs
   * no creation and carries no ownership authority.
   */
  redirect('/');
}
