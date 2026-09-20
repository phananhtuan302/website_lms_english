import { Navigate, useParams } from 'react-router-dom';
import { classTabPath } from '../../lib/classWorkspace';

/** Catch-all child of the class layout: an unknown tab URL (`/teacher/classes/:id/nope`)
 * lands on the class's Tổng quan instead of a blank body under the tab bar. */
function ClassUnknownTabRedirect() {
  const { classId = '' } = useParams<{ classId: string }>();
  return <Navigate to={classTabPath(classId)} replace />;
}

export default ClassUnknownTabRedirect;
